/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { SequenceEvent } from "@prague/sequence";
import { emptyObject } from "../util";
import { hasTag, Tag } from "../util/tag";
import { Layout } from "./layout";

// tslint:disable-next-line:no-empty-interface
export interface IFormatterState { }

function getNext(layout: Layout) {
    const cursor = layout.cursor;
    const { previous } = cursor;

    return (previous && previous.nextSibling) || cursor.parent.firstChild;
}

export abstract class Formatter<TState extends IFormatterState> {
    public abstract begin(
        layout: Layout,
        init: Readonly<Partial<TState>>,
        prevState: Readonly<TState> | undefined,
    ): Readonly<TState>;

    public abstract visit(
        layout: Layout,
        state: Readonly<TState>,
    ): { consumed: boolean, state: Readonly<TState> };

    public abstract end(
        layout: Layout,
        state: Readonly<TState>,
    );

    public toString() { return this.constructor.name; }

    protected pushTag(layout: Layout, tag: Tag, existing = getNext(layout)) {
        existing = this.elementForTag(layout, tag, existing);
        layout.pushNode(existing);
        return existing as HTMLElement;
    }

    protected emitTag(layout: Layout, tag: Tag, existing = getNext(layout)) {
        existing = this.elementForTag(layout, tag, existing);
        layout.emitNode(existing);
        return existing as HTMLElement;
    }

    protected elementForTag(layout: Layout, tag: Tag, existing?: Node | Element) {
        // Reuse the existing element if possible, otherwise create a new one.  Note that
        // 'layout.pushNode(..)' will clean up the old node if needed.
        return hasTag(existing, tag) && layout.nodeToSegment(existing) === layout.segment
            ? existing as HTMLElement
            : document.createElement(tag);
    }
}

export abstract class RootFormatter<TState extends IFormatterState> extends Formatter<TState> {
    public abstract onChange(layout: Layout, e: SequenceEvent);

    public prepare(layout: Layout, start: number, end: number) {
        return { start, end };
    }
}

export class BootstrapFormatter<TFormatter extends RootFormatter<TState>, TState extends IFormatterState> extends RootFormatter<IFormatterState> {
    constructor(private readonly formatter: Readonly<TFormatter>) { super(); }

    public begin(): never { throw new Error(); }

    public visit(layout: Layout, state: Readonly<IFormatterState>) {
        layout.pushFormat(this.formatter, emptyObject);
        return { state, consumed: false };
    }

    public end(): never { throw new Error(); }

    public onChange(layout: Layout, e: SequenceEvent) { this.formatter.onChange(layout, e); }
    public prepare(layout: Layout, start: number, end: number) { return this.formatter.prepare(layout, start, end); }
}
