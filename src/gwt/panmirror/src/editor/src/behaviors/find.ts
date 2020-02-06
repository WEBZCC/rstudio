/*
 * find.ts
 *
 * Copyright (C) 2019-20 by RStudio, PBC
 *
 * Unless you have received this program directly from RStudio pursuant
 * to the terms of a commercial license agreement with RStudio, then
 * this program is licensed to you under the terms of version 3 of the
 * GNU Affero General Public License. This program is distributed WITHOUT
 * ANY EXPRESS OR IMPLIED WARRANTY, INCLUDING THOSE OF NON-INFRINGEMENT,
 * MERCHANTABILITY OR FITNESS FOR A PARTICULAR PURPOSE. Please refer to the
 * AGPL (http://www.gnu.org/licenses/agpl-3.0.txt) for more details.
 *
 */


import { Extension } from '../api/extension';
import { Plugin, PluginKey, EditorState, Transaction, TextSelection } from 'prosemirror-state';
import { DecorationSet, Decoration, EditorView } from 'prosemirror-view';
import { Node as ProsemirrorNode } from 'prosemirror-model';

import { mergedTextNodes } from '../api/text';

const key = new PluginKey<DecorationSet>('find-plugin');

class FindPlugin extends Plugin<DecorationSet> {

  private term: string = "";
  private options: FindOptions = {};
  private updating: boolean = false;

  constructor() {
    super({
      key,
        state: {
          init: (_config: { [key: string]: any }, instance: EditorState) => {
            return DecorationSet.empty;
          },
          apply: (tr: Transaction, old: DecorationSet, oldState: EditorState, newState: EditorState) => {
            if (this.updating) {
              return this.resultDecorations(tr.doc);
            } else if (tr.docChanged) {
              return old.map(tr.mapping, tr.doc);
            } else {
              return old;
            }
          },
        },
        props: {
          decorations: (state: EditorState) => {
            return key.getState(state);
          },
        },
    });    
  }

  public find(term: string, options: FindOptions) {
    return (state: EditorState<any>, dispatch?: ((tr: Transaction<any>) => void)) => {
      if (dispatch) {
        this.term = !options.regex ? term.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&') : term;
        this.options = options;
        this.updateResults(state, dispatch);
      }
      return true;
    };
  }

  public matchCount(state: EditorState) {
    return key.getState(state).find().length;
  }


  public selectFirst() {
    return (state: EditorState<any>, dispatch?: ((tr: Transaction<any>) => void)) => {
      
      const decorations: Decoration[] = key.getState(state).find(0);
      if (decorations.length === 0) {
        return false;
      }
      
      if (dispatch) {
        const tr = state.tr;
        this.selectResult(tr, decorations[0]);
        dispatch(tr);
      }

      return true;
    };
  }

  public selectNext() {
    return (state: EditorState<any>, dispatch?: ((tr: Transaction<any>) => void)) => {
      
      const selectedText = state.doc.textBetween(state.selection.from, state.selection.to);
      const searchFrom = this.matchesTerm(selectedText) ? state.selection.to + 1 : state.selection.to;

      const decorationSet = key.getState(state);
      let decorations: Decoration[] = decorationSet.find(searchFrom);
      if (decorations.length === 0) {

        // check for wrapping
        if (this.options.wrap) {
          const searchTo = this.matchesTerm(selectedText) ? state.selection.from - 1 : state.selection.from;
          decorations = decorationSet.find(0, searchTo);
          if (decorations.length === 0) {
            return false;
          }
        // no wrapping
        } else {
          return false;
        }
      }
      
      if (dispatch) {
        const tr = state.tr;
        this.selectResult(tr, decorations[0]);
        dispatch(tr);
      }
      return true;
    };

  }


  public selectPrevious() {
    return (state: EditorState<any>, dispatch?: ((tr: Transaction<any>) => void)) => {
      
      // sort out where we are searching up to
      const selectedText = state.doc.textBetween(state.selection.from, state.selection.to);
      const searchTo = this.matchesTerm(selectedText) ? state.selection.from - 1 : state.selection.from;

      // get all decorations up to the current selection
      const decorationSet = key.getState(state);
      let decorations: Decoration[] = decorationSet.find(0, searchTo);
      if (decorations.length === 0) {
         // handle wrapping
         if (this.options.wrap) {
          const searchFrom = this.matchesTerm(selectedText) ? state.selection.to + 1 : state.selection.to;
          decorations = decorationSet.find(searchFrom);
          if (decorations.length === 0) {
            return false;
          }
         // no wrapping
         } else {
          return false;
         }
      }
      
      // find the one closest to the beginning of the current selection
      if (dispatch) {

        // now we need to find the decoration with the largest from value
        const decoration = decorations.reduce((lastDecoration, nextDecoration) => {
          if (nextDecoration.from > lastDecoration.from) {
            return nextDecoration;
          } else {
            return lastDecoration;
          }
        });

        const tr = state.tr;
        this.selectResult(tr, decoration);
        dispatch(tr);

      }
      return true;
    };

  }
  
  public replace(text: string) {
    return (state: EditorState<any>, dispatch?: ((tr: Transaction<any>) => void)) => {
      
      if (!this.isResultSelected(state)) {
        return false;
      }      

      if (dispatch) {
        const tr = state.tr;
        const selStart = tr.selection.from;
        tr.insertText(text);
        tr.setSelection(new TextSelection(tr.doc.resolve(selStart), tr.doc.resolve(selStart + text.length)));
        tr.scrollIntoView();
        this.withResultUpdates(() => {
          dispatch(tr);
        });
      }

      return true;
    };
  }

  public replaceAll(text: string) {
    return (state: EditorState<any>, dispatch?: ((tr: Transaction<any>) => void)) => {
      
      if (!this.hasTerm()) {
        return false;
      }      
      
      if (dispatch) {
        const tr = state.tr;
        const oldSel = tr.selection.from;

        const decorationSet = key.getState(state);

        let decorations: Decoration[] = decorationSet.find(0);
        decorations.forEach(decoration => {
          const from = tr.mapping.map(decoration.from);
          const to = tr.mapping.map(decoration.to);
          tr.insertText(text, from, to);
        });

        const newSel = tr.mapping.map(oldSel);
        tr.setSelection(new TextSelection(tr.doc.resolve(newSel)));
        tr.scrollIntoView();
        this.withResultUpdates(() => {
          dispatch(tr);
        });
      }

      return true;
    };
  }
  

  public clear() {
    return (state: EditorState<any>, dispatch?: ((tr: Transaction<any>) => void)) => {
      if (dispatch) {
        this.term = "";
        this.options = {};
        this.updateResults(state, dispatch);
      }
      return true;
    };
  }


  private updateResults(state: EditorState, dispatch: ((tr: Transaction<any>) => void)) {
    this.withResultUpdates(() => { 
      dispatch(state.tr);
    });
  }


  private resultDecorations(doc: ProsemirrorNode) : DecorationSet {
  
    // bail if no search term
    if (!this.hasTerm()) {
      return DecorationSet.empty;
    }

    // decorations to return
    const decorations: Decoration[] = [];

    // perform search and populate results
    const textNodes = mergedTextNodes(doc);
    textNodes.forEach(textNode => {
      const search = this.findRegEx();
      let m;
      // eslint-disable-next-line no-cond-assign
      while ((m = search.exec(textNode.text))) {
        if (m[0] === '') {
          break;
        }
        const from = textNode.pos + m.index;
        const to = textNode.pos + m.index + m[0].length;
        const cls = 'pm-find-text';
        decorations.push(Decoration.inline(from, to, { class: cls }));
      }
    });

    // return as decoration set
    return decorations.length ? DecorationSet.create(doc, decorations) : DecorationSet.empty;
  }
  
  private withResultUpdates(f: () => void) {
    this.updating = true;
    f();
    this.updating = false;
  }

  private selectResult(tr: Transaction, decoration: Decoration) {
    const selection = new TextSelection(tr.doc.resolve(decoration.from), tr.doc.resolve(decoration.to));
    tr.setSelection(selection).scrollIntoView();
    return tr;
  }

  private isResultSelected(state: EditorState) {
    if (this.hasTerm()) {
      const selectedText = state.doc.textBetween(state.selection.from, state.selection.to);
      return this.matchesTerm(selectedText);
    } else {
      return false;
    }
  }

  private hasTerm() {
    return this.term.length > 0;
  }

  private matchesTerm(text: string) {
    if (this.hasTerm()) {
      return this.findRegEx().test(text);
    } else {
      return false;
    }
  }

  private findRegEx() {
    return new RegExp(this.term, !this.options.caseSensitive ? 'gui' : 'gu');
  }


};

const extension: Extension = {
  
  plugins: () => {
    return [
      new FindPlugin()
    ];
  }

};


export interface FindOptions {
  regex?: boolean;
  caseSensitive?: boolean;
  wrap?: boolean;
}


export function find(view: EditorView, term: string, options: FindOptions) : boolean {
  const plugin = findPlugin(view);
  return plugin.find(term, options)(view.state, view.dispatch);
}

export function matchCount(view: EditorView) : number {
  const plugin = findPlugin(view);
  return plugin.matchCount(view.state);
}

export function selectFirst(view: EditorView) : boolean {
  const plugin = findPlugin(view);
  return plugin.selectFirst()(view.state, view.dispatch);
}

export function selectNext(view: EditorView) : boolean {
  const plugin = findPlugin(view);
  return plugin.selectNext()(view.state, view.dispatch);
}

export function selectPrevious(view: EditorView) : boolean {
  const plugin = findPlugin(view);
  return plugin.selectPrevious()(view.state, view.dispatch);
}

export function replace(view: EditorView, text: string) : boolean {
  const plugin = findPlugin(view);
  return plugin.replace(text)(view.state, view.dispatch);
}

export function replaceAll(view: EditorView, text: string) {
  const plugin = findPlugin(view);
  return plugin.replaceAll(text)(view.state, view.dispatch);
}


function findPlugin(view: EditorView) : FindPlugin {
  return key.get(view.state) as FindPlugin;
}



export default extension;