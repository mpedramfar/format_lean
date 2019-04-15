/// <reference types="monaco-editor" />
import * as lean from 'lean-client-js-browser';
import { leanSyntax } from './syntax';
import * as translations from './translations.json';

export class CoalescedTimer {
  private timer: number = undefined;
  do(ms: number, f: () => void) {
    if (this.timer) {
      clearTimeout(this.timer);
    }
    this.timer = setTimeout(() => {
      this.timer = undefined;
      f();
    }, ms) as any;
  }
}

export class ReactiveValue<E> {
  updated = new lean.Event<E>();
  private lastValue: E;

  constructor(initialValue: E) {
    this.lastValue = initialValue;
    this.updated.on((e) => this.lastValue = e);
  }

  get value() { return this.lastValue; }
}

export let server: lean.Server;
export let allMessages: lean.Message[] = [];

export const currentlyRunning = new ReactiveValue<string[]>([]);
function addToRunning(fn: string) {
  if (currentlyRunning.value.indexOf(fn) === -1) {
    currentlyRunning.updated.fire([].concat([fn], currentlyRunning.value));
  }
}
function removeFromRunning(fn: string) {
  currentlyRunning.updated.fire(currentlyRunning.value.filter((v) => v !== fn));
}

const watchers = new Map<string, ModelWatcher>();

const delayMs = 200;

class ModelWatcher implements monaco.IDisposable {
  private changeSubscription: monaco.IDisposable;
  private syncTimer = new CoalescedTimer();
  private version = 0;

  constructor(private model: monaco.editor.IModel) {
    this.changeSubscription = model.onDidChangeContent((e) => {
      completionBuffer.cancel();
      this.checkInputCompletion(e);
      this.syncIn(delayMs);
    });
    this.syncNow();
  }

  dispose() { this.changeSubscription.dispose(); }

  syncIn(ms: number) {
    addToRunning(this.model.uri.fsPath);
    completionBuffer.cancel();
    const version = (this.version += 1);
    this.syncTimer.do(ms, () => {
      if (!server) {
        return;
      }
      server.sync(this.model.uri.fsPath, this.model.getValue()).then(() => {
        if (this.version === version) {
          removeFromRunning(this.model.uri.fsPath);
        }
      });
    });
  }

  syncNow() { this.syncIn(0); }

  checkInputCompletion(e: monaco.editor.IModelContentChangedEvent) {
    if (e.changes.length !== 1) {
      return;
    }
    const change = e.changes[0];
    if (change.rangeLength === 0) {
      if (change.text === ' ' || change.text === '\\') {
        const lineNum = change.range.startLineNumber;
        const line = this.model.getLineContent(change.range.startLineNumber);
        const cursorPos = change.range.startColumn;
        const index = line.lastIndexOf('\\', cursorPos - 1) + 1;
        const match = line.substring(index, cursorPos - 1);
        const replaceText = translations[match];
        if (index && replaceText) {
          const range = new monaco.Range(lineNum, index, lineNum, cursorPos);
          this.model.applyEdits([{
            identifier: { major: 1, minor: 1 },
            range,
            text: replaceText,
            forceMoveMarkers: true,
          }]);
        }
      }
    }
  }
}

class CompletionBuffer {
  private reject: (reason: any) => void;
  private timer;

  wait(ms: number): Promise<void> {
    this.cancel();
    return new Promise<void>((resolve, reject) => {
      this.reject = reject;
      this.timer = setTimeout(() => {
        this.timer = undefined;
        resolve();
      }, ms);
    });
  }
  cancel() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.reject('timeout');
      this.timer = undefined;
    }
  }
}
const completionBuffer = new CompletionBuffer();

function toSeverity(severity: lean.Severity): monaco.Severity {
  switch (severity) {
    case 'warning': return monaco.Severity.Warning;
    case 'error': return monaco.Severity.Error;
    case 'information': return monaco.Severity.Info;
  }
}

export function registerLeanLanguage(leanJsOpts: lean.LeanJsOpts) {
  if (server) {
    return;
  }

  const transport =
    (window as any).Worker ?
      new lean.WebWorkerTransport(leanJsOpts) :
      new lean.BrowserInProcessTransport(leanJsOpts);
  server = new lean.Server(transport);
  server.error.on((err) => console.log('error:', err));
  server.connect();
  // server.logMessagesToConsole = true;

  monaco.languages.register({
    id: 'lean',
    filenamePatterns: ['*.lean'],
  });

  monaco.editor.onDidCreateModel((model) => {
    if (model.getModeId() === 'lean') {
      watchers.set(model.uri.fsPath, new ModelWatcher(model));
    }
  });
  monaco.editor.onWillDisposeModel((model) => {
    const watcher = watchers.get(model.uri.fsPath);
    if (watcher) {
      watcher.dispose();
      watchers.delete(model.uri.fsPath);
    }
  });

  server.allMessages.on((allMsgs) => {
    allMessages = allMsgs.msgs;
    for (const model of monaco.editor.getModels()) {
      const fn = model.uri.fsPath;
      const markers: monaco.editor.IMarkerData[] = [];
      for (const msg of allMsgs.msgs) {
        if (msg.file_name !== fn) {
          continue;
        }
        const marker: monaco.editor.IMarkerData = {
          severity: toSeverity(msg.severity),
          message: msg.text,
          startLineNumber: msg.pos_line,
          startColumn: msg.pos_col + 1,
          endLineNumber: msg.pos_line,
          endColumn: msg.pos_col + 1,
        };
        if (msg.end_pos_line && msg.end_pos_col) {
          marker.endLineNumber = msg.end_pos_line;
          marker.endColumn = msg.end_pos_col + 1;
        }
        markers.push(marker);
      }
      monaco.editor.setModelMarkers(model, 'lean', markers);
    }
  });

  monaco.languages.registerCompletionItemProvider('lean', {
    provideCompletionItems: (editor, position) =>
      completionBuffer.wait(delayMs).then(() => {
        watchers.get(editor.uri.fsPath).syncNow();
        return server.complete(editor.uri.fsPath, position.lineNumber, position.column - 1).then((result) => {
          const items: monaco.languages.CompletionItem[] = [];
          for (const compl of result.completions || []) {
            const item = {
              kind: monaco.languages.CompletionItemKind.Function,
              label: compl.text,
              detail: compl.type,
              documentation: compl.doc,
              range: new monaco.Range(position.lineNumber, position.column - result.prefix.length,
                position.lineNumber, position.column),
            };
            if (compl.tactic_params) {
              item.detail = compl.tactic_params.join(' ');
            }
            items.push(item);
          }
          return items;
        });
      }, () => undefined),
  });

  monaco.languages.registerHoverProvider('lean', {
    provideHover: (editor, position): Promise<monaco.languages.Hover> => {
      return server.info(editor.uri.fsPath, position.lineNumber, position.column - 1).then((response) => {
        const marked: monaco.MarkedString[] = [];
        const record = response.record;
        if (!record) {
          return { contents: [] } as monaco.languages.Hover;
        }
        const name = record['full-id'] || record.text;
        if (name) {
          if (response.record.tactic_params) {
            marked.push({
              language: 'text',
              value: name + ' ' + record.tactic_params.join(' '),
            });
          } else {
            marked.push({
              language: 'lean',
              value: name + ' : ' + record.type,
            });
          }
        }
        if (response.record.doc) {
          marked.push(response.record.doc);
        }
        if (response.record.state) {
          marked.push({ language: 'lean', value: record.state });
        }
        return {
          contents: marked,
          range: {
            startLineNumber: position.lineNumber,
            startColumn: position.column,
            endLineNumber: position.lineNumber,
            endColumn: position.column,
          },
        };
      });
    },
  });

  monaco.languages.setMonarchTokensProvider('lean', leanSyntax as any);

}

export function registerActiveLeanLanguage(activeEditorData: any) {

  monaco.languages.register({
    id: 'active_lean'
  });

  server.allMessages.on((allMsgs) => {
    allMessages = allMsgs.msgs;
    const model = activeEditorData.editor.getModel();
    const fsPath = activeEditorData.fsPath;
    const markers: monaco.editor.IMarkerData[] = [];

    for (const msg of allMsgs.msgs) {
      if (msg.file_name !== fsPath) {
        continue;
      }
      const marker: monaco.editor.IMarkerData = {
        severity: toSeverity(msg.severity),
        message: msg.text,
        startLineNumber: msg.pos_line - activeEditorData.lineOffset,
        startColumn: msg.pos_col + 1,
        endLineNumber: msg.pos_line - activeEditorData.lineOffset,
        endColumn: msg.pos_col + 1,
      };
      if (msg.end_pos_line && msg.end_pos_col) {
        marker.endLineNumber = msg.end_pos_line - activeEditorData.lineOffset;
        marker.endColumn = msg.end_pos_col + 1;
      }

      if(marker.startLineNumber >= 1 && marker.endLineNumber <= model.getLineCount())
        markers.push(marker);
    }
    monaco.editor.setModelMarkers(model, 'active_lean', markers);

  });

  // This is essentially same as before, except we're looking at what happens 
  // in the "fsPath" instead of the editor where change is happening
  monaco.languages.registerCompletionItemProvider('active_lean', {
    provideCompletionItems: (editor, position) =>
      completionBuffer.wait(delayMs).then(() => {
        watchers.get(activeEditorData.fsPath).syncNow();
        return server.complete(activeEditorData.fsPath, position.lineNumber + activeEditorData.lineOffset.line, position.column - 1).then((result) => {
          const items: monaco.languages.CompletionItem[] = [];
          for (const compl of result.completions || []) {
            const item = {
              kind: monaco.languages.CompletionItemKind.Function,
              label: compl.text,
              detail: compl.type,
              documentation: compl.doc,
              range: new monaco.Range(position.lineNumber + activeEditorData.lineOffset, position.column - result.prefix.length,
                position.lineNumber + activeEditorData.lineOffset, position.column),
            };
            if (compl.tactic_params) {
              item.detail = compl.tactic_params.join(' ');
            }
            items.push(item);
          }
          return items;
        });
      }, () => undefined),
  });

  monaco.languages.registerHoverProvider('active_lean', {
    provideHover: (editor, position): Promise<monaco.languages.Hover> => {
      return server.info(activeEditorData.fsPath, position.lineNumber + activeEditorData.lineOffset, position.column - 1).then((response) => {
        const marked: monaco.MarkedString[] = [];
        const record = response.record;
        if (!record) {
          return { contents: [] } as monaco.languages.Hover;
        }
        const name = record['full-id'] || record.text;
        if (name) {
          if (response.record.tactic_params) {
            marked.push({
              language: 'text',
              value: name + ' ' + record.tactic_params.join(' '),
            });
          } else {
            marked.push({
              language: 'active_lean',
              value: name + ' : ' + record.type,
            });
          }
        }
        if (response.record.doc) {
          marked.push(response.record.doc);
        }
        if (response.record.state) {
          marked.push({ language: 'active_lean', value: record.state });
        }
        return {
          contents: marked,
          range: {
            startLineNumber: position.lineNumber + activeEditorData.lineOffset,
            startColumn: position.column,
            endLineNumber: position.lineNumber + activeEditorData.lineOffset,
            endColumn: position.column,
          },
        };
      });
    },
  });

  monaco.languages.setMonarchTokensProvider('active_lean', leanSyntax as any);
}

// The following function should be added to the "onDidChangeContent" for the model of the active editor
// It will translate things like "\to" into arrow
export function modelCheckInputCompletionOnDidChangeContent(model: monaco.editor.IModel) {
  function checkInputCompletion(e: monaco.editor.IModelContentChangedEvent) {
    if (e.changes.length !== 1) {
      return;
    }
    const change = e.changes[0];
    if (change.rangeLength === 0) {
      if (change.text === ' ' || change.text === '\\') {
        const lineNum = change.range.startLineNumber;
        const line = model.getLineContent(change.range.startLineNumber);
        const cursorPos = change.range.startColumn;
        const index = line.lastIndexOf('\\', cursorPos - 1) + 1;
        const match = line.substring(index, cursorPos - 1);
        const replaceText = translations[match];
        if (index && replaceText) {
          const range = new monaco.Range(lineNum, index, lineNum, cursorPos);
          model.applyEdits([{
            identifier: { major: 1, minor: 1 },
            range,
            text: replaceText,
            forceMoveMarkers: true,
          }]);
        }
      }
    }
  }

  return (e) => {
    completionBuffer.cancel();
    checkInputCompletion(e);
  };
}

