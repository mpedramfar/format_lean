/// <reference types="monaco-editor" />
import { InfoRecord, LeanJsOpts, Message, Severity } from 'lean-client-js-browser';
import * as React from 'react';
import { findDOMNode, render } from 'react-dom';
import { allMessages, currentlyRunning, registerLeanLanguage, registerActiveLeanLanguage, modelCheckInputCompletionOnDidChangeContent, server } from './langservice';

const $ = require("jquery");

const codeBlockStyle = {
  display: 'block',
  fontFamily: 'monospace',
  whiteSpace: 'pre-wrap',
  marginTop: '1em',
  fontSize: '110%',
};

function leanColorize(text: string): string {
  // TODO(gabriel): use promises
  const colorized: string = (monaco.editor.colorize(text, 'lean', {}) as any)._value;
  return colorized.replace(/&nbsp;/g, ' ');
}

interface MessageWidgetProps {
  msg: Message;
}
function MessageWidget({ msg }: MessageWidgetProps) {
  const colorOfSeverity = {
    information: 'green',
    warning: 'orange',
    error: 'red',
  };

  return (
    <div style={{ paddingBottom: '1em' }}>
      <div style={{
        borderBottom: '1px solid', fontFamily: 'sans-serif',
        fontWeight: 'bold', color: colorOfSeverity[msg.severity]
      }}>
        {msg.pos_line}:{msg.pos_col}: {msg.severity}: {msg.caption}</div>
      <div style={codeBlockStyle} dangerouslySetInnerHTML={{ __html: leanColorize(msg.text) }} />
    </div>
  );
}

interface Position {
  line: number;
  column: number;
}

interface GoalWidgetProps {
  goal: InfoRecord;
  position: Position;
}
function GoalWidget({ goal, position }: GoalWidgetProps) {
  return (
    <div style={{ paddingBottom: '1em' }}>
      <div style={{ borderBottom: '1px solid', fontWeight: 'bold', fontFamily: 'sans-serif' }}>
        goal at {position.line}:{position.column}</div>
      <div style={codeBlockStyle} dangerouslySetInnerHTML={{ __html: leanColorize(goal.state) }} />
    </div>
  );
}

interface InfoViewProps {
  file: string;
  cursor?: Position;
}
interface InfoViewState {
  goal?: GoalWidgetProps;
  messages: Message[];
}
class InfoView extends React.Component<InfoViewProps, InfoViewState> {
  private subscriptions: monaco.IDisposable[] = [];

  constructor(props: InfoViewProps) {
    super(props);
    this.state = { messages: [] };
  }

  componentWillMount() {
    this.updateMessages(this.props);
    this.subscriptions.push(
      server.allMessages.on((allMsgs) => this.updateMessages(this.props)),
    );
  }

  updateMessages(nextProps) {
    this.setState({
      messages: allMessages.filter((v) => v.file_name === this.props.file),
    });
  }

  componentWillUnmount() {
    for (const s of this.subscriptions) {
      s.dispose();
    }
    this.subscriptions = [];
  }

  render() {
    const goal = this.state.goal && (<div key={'goal'}>{GoalWidget(this.state.goal)}</div>);
    const msgs = this.state.messages.map((msg, i) =>
      (<div key={i}>{MessageWidget({ msg })}</div>));
    return (
      <div id="info_view_div">
        <PageHeader file={this.props.file} />
        {goal}
        {msgs}
      </div>
    );
  }

  componentWillReceiveProps(nextProps) {
    this.updateMessages(nextProps);
    this.refreshGoal(nextProps);
  }

  refreshGoal(nextProps?: InfoViewProps) {
    if (!nextProps) {
      nextProps = this.props;
    }
    if (!nextProps.cursor) {
      return;
    }

    const position = nextProps.cursor;
    server.info(nextProps.file, position.line, position.column).then((res) => {
      this.setState({ goal: res.record && res.record.state && { goal: res.record, position } });
    });
  }
}

interface PageHeaderProps {
  file: string;
}
interface PageHeaderState {
  currentlyRunning: boolean;
}
class PageHeader extends React.Component<PageHeaderProps, PageHeaderState> {
  private subscriptions: monaco.IDisposable[] = [];

  constructor(props: PageHeaderProps) {
    super(props);
    this.state = { currentlyRunning: true };
  }

  componentWillMount() {
    this.updateRunning(this.props);
    this.subscriptions.push(
      currentlyRunning.updated.on((fns) => this.updateRunning(this.props)),
    );
  }

  updateRunning(nextProps) {
    this.setState({
      currentlyRunning: currentlyRunning.value.indexOf(nextProps.file) !== -1,
    });
  }

  componentWillUnmount() {
    for (const s of this.subscriptions) {
      s.dispose();
    }
    this.subscriptions = [];
  }

  render() {
    return this.state.currentlyRunning &&
      <div style={{ height: '2em', overflow: 'hidden' }}>
        <div style={{ fontStyle: 'italic' }}>(running...)</div>
      </div>;
  }

  componentWillReceiveProps(nextProps) {
    this.updateRunning(nextProps);
  }
}


var setEditableSubstring;


interface LeanEditorProps {
  file: string;
  rawText: string;
}
interface LeanEditorState {
  cursor?: Position;
  startIndex: number;
  endIndex: number;
}
class LeanEitor extends React.Component<LeanEditorProps, LeanEditorState> {
  model: monaco.editor.IModel;
  editor: monaco.editor.IStandaloneCodeEditor;
  activeModel: monaco.editor.IModel;
  activeEditor: monaco.editor.IStandaloneCodeEditor;
  ignoreLastChangeActiveModel: boolean;
  activeEditorData: { editor?: monaco.editor.IStandaloneCodeEditor, lineOffset?: number, fsPath: any };

  constructor(props) {
    super(props);
    this.state = { startIndex: 0, endIndex: this.props.rawText.length };

    const uri = monaco.Uri.file(this.props.file);
    this.model = monaco.editor.createModel(this.props.rawText, 'lean', uri);

    // Registering the version of Lean language suitable for the active editor
    this.activeEditorData = { fsPath: uri.fsPath, lineOffset: 0 };
    registerActiveLeanLanguage(this.activeEditorData);

    var activeText = this.props.rawText.substring(this.state.startIndex, this.state.endIndex);
    this.activeModel = monaco.editor.createModel(activeText, "active_lean");
    this.activeModel.onDidChangeContent(this.onActiveModelChangeContent.bind(this));

  }

  onActiveModelChangeContent(e: monaco.editor.IModelContentChangedEvent) {
    modelCheckInputCompletionOnDidChangeContent(this.activeModel)(e); // Translate things like "\to" into arrow

    this.model.setValue(this.props.rawText.substring(0, this.state.startIndex) +
      this.activeModel.getValue() +
      this.props.rawText.substring(this.state.endIndex, this.props.rawText.length));
  }

  componentDidMount() {
    const node = findDOMNode(this.refs.monaco) as HTMLElement;
    const options: monaco.editor.IEditorConstructionOptions = {
      selectOnLineNumbers: true,
      roundedSelection: false,
      readOnly: false,
      theme: 'vs',
      cursorStyle: 'line',
      automaticLayout: true,
      cursorBlinking: 'solid',
      model: this.model,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
    };
    this.editor = monaco.editor.create(node, options);
    this.editor.onDidChangeCursorPosition((e) =>
      this.setState({ cursor: { line: e.position.lineNumber, column: e.position.column - 1 } }));

    const activeNode = findDOMNode(this.refs.active_monaco) as HTMLElement;
    const activeOptions: monaco.editor.IEditorConstructionOptions = {
      ...options,
      model: this.activeModel,
    };
    this.activeEditor = monaco.editor.create(activeNode, activeOptions);
    this.activeEditorData.editor = this.activeEditor;
    this.activeEditor.onDidChangeCursorPosition((e) =>
      this.setState({
        cursor: {
          line: e.position.lineNumber + this.activeEditorData.lineOffset,
          column: e.position.column - 1
        }
      }));


    setEditableSubstring = (firstLine, lastLine) => {

      function nthIndex(str, pat, n) {
        var L = str.length, i = -1;
        while (n-- && i++ < L) {
          i = str.indexOf(pat, i);
          if (i < 0) break;
        }
        return i;
      }

      var startIndex = nthIndex(this.props.rawText, "\n", firstLine - 1) + 1;
      var endIndex = nthIndex(this.props.rawText, "\n", lastLine);

      this.setState({ startIndex: startIndex, endIndex: endIndex });
      this.activeEditorData.lineOffset = firstLine - 1;
      const options: monaco.editor.IEditorOptions = {
        lineNumbers: (num) => (num + firstLine - 1).toString()
      };
      this.activeEditor.updateOptions(options);

      this.reset();
    };
  }

  componentWillUnmount() {
    this.editor.dispose();
    this.editor = undefined;
    this.activeEditor.dispose();
    this.activeEditor = undefined;
  }



  reset() {
    var activeText = this.props.rawText.substring(this.state.startIndex, this.state.endIndex);
    this.activeModel.setValue(activeText);
  }

  render() {
    const activeEditorDiv = <div id='active_editor' style={{ display: 'flex', flexDirection: 'row', marginTop: '1ex', marginBottom: '1ex' }}>
      <div ref='active_monaco' style={{
        height: '100%', width: 'calc(100% - 2em)',
        marginRight: '1ex',
        overflow: 'hidden',
      }} />
      <div style={{ width: '2em' }} >
        <button id='close' style={{ width: '100%', height: '50%', borderStyle: 'none' }}>&#x274c;</button>
        <button style={{ width: '100%', height: '50%', borderStyle: 'none' }} onClick={this.reset.bind(this)} >&#x21bb;</button>
      </div>
    </div>;

    const editorDiv = <div ref='monaco'/>;

    return <div style={{ display : 'block' }}>
      {activeEditorDiv}
      {editorDiv}
      <InfoView file={this.props.file} cursor={this.state.cursor} />
    </div>;

  }
}



const leanJsOpts: LeanJsOpts = {
  javascript: './lean_js_js.js',
  libraryZip: './library.zip',
  webassemblyJs: './lean_js_wasm.js',
  webassemblyWasm: './lean_js_wasm.wasm',
};



function App(props) {
  const fn = monaco.Uri.file('test.lean').fsPath;
  return <LeanEitor file={fn} rawText={props.rawText} />;
}



// tslint:disable-next-line:no-var-requires
(window as any).require(['vs/editor/editor.main'], () => {
  registerLeanLanguage(leanJsOpts);

  $(document).ready(function () {

    var rawText = $("#raw_text").text();
    //    rawText = "example (m n : ℕ) : m + n = n + m :=\nby simp\n\n#print nat";
    render(
      <App rawText={rawText} />,
      document.getElementById('root'),
    );


    $("[editable_text]").dblclick(
      function () {
        $("#close").trigger('click');

        var s = JSON.parse($(this).attr("editable_text"));
        setEditableSubstring(s[0], s[1]);

        var h = Number(s[1]) - Number(s[0]) + 2;
        $(this).attr("active_div", "true").hide();
        $("#active_editor").insertAfter($(this)).show().height(h + 'em');

        $("#tactic_state").hide();
        $("#tactic_state_header").text("Info");
        $("#info_view_div").insertAfter($("#tactic_state")).show();
      });

    $("#close").click(
      function () {
        $("#active_editor").hide();
        $("[active_div=true]").show().removeAttr("active_div");
        $("#info_view_div").hide();
        $("#tactic_state").show();

        $("#tactic_state_header").text("Tactic State");
      });

  });

});
