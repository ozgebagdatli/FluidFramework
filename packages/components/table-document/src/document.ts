/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Component } from "@prague/app-component";
import { Workbook } from "@prague/client-ui/ext/calc2";
import { CounterValueType, MapExtension, registerDefaultValueType  } from "@prague/map";
import {
    ICombiningOp,
    IntervalType,
    LocalReference,
    PropertySet,
    UniversalSequenceNumber,
} from "@prague/merge-tree";
import {
    positionToRowCol,
    rowColToPosition,
    SharedIntervalCollectionValueType,
    SharedNumberSequence,
    SharedNumberSequenceExtension,
    SharedStringIntervalCollectionValueType,
    SparseMatrix,
    SparseMatrixExtension,
    UnboxedOper,
} from "@prague/sequence";
import * as assert from "assert";
import { CellRange } from "./cellrange";
import { TableSliceType } from "./ComponentTypes";
import { debug } from "./debug";
import { TableSlice } from "./slice";
import { ITable } from "./table";

export const loadCellTextSym = Symbol("TableDocument.loadCellText");
export const storeCellTextSym = Symbol("TableDocument.storeCellText");
export const loadCellSym = Symbol("TableDocument.loadCell");
export const storeCellSym = Symbol("TableDocument.storeCell");
export const cellSym = Symbol("TableDocument.cell");

class WorkbookAdapter extends Workbook {
    constructor(private readonly doc: TableDocument) {
        super();
    }

    protected get numRows() { return this.doc.numRows; }
    protected get numCols() { return this.doc.numCols; }

    protected loadCellText(row: number, col: number): UnboxedOper {
        return this.doc[loadCellTextSym](row, col);
    }

    protected storeCellText(row: number, col: number, value: UnboxedOper) {
        this.doc[storeCellTextSym](row, col, value);
    }

    protected loadCellData(row: number, col: number): object | undefined {
        return this.doc[loadCellSym](row, col);
    }

    protected storeCellData(row: number, col: number, cell: object | undefined) {
        this.doc[storeCellSym](row, col, cell);
    }
}

export class TableDocument extends Component implements ITable {
    public  get numCols()    { return this.maybeCols!.client.getLength(); }
    public  get numRows()    { return this.matrix.numRows; }

    private get matrix()        { return this.maybeMatrix!; }
    private get workbook()      { return this.maybeWorkbook!; }

    private maybeRows?: SharedNumberSequence;
    private maybeCols?: SharedNumberSequence;
    private maybeMatrix?: SparseMatrix;
    private maybeWorkbook?: WorkbookAdapter;

    constructor() {
        super([
            [MapExtension.Type, new MapExtension()],
            [SparseMatrixExtension.Type, new SparseMatrixExtension()],
            [SharedNumberSequenceExtension.Type, new SharedNumberSequenceExtension()],
        ]);

        registerDefaultValueType(new CounterValueType());
        registerDefaultValueType(new SharedStringIntervalCollectionValueType());
        registerDefaultValueType(new SharedIntervalCollectionValueType());
    }

    public evaluateCell(row: number, col: number) {
        try {
            return this.workbook.evaluateCell(row, col);
        } catch (e) {
            return `${e}`;
        }
    }

    public evaluateFormula(formula: string) {
        try {
            return this.workbook.evaluateFormulaText(formula, 0, 0);
        } catch (e) {
            return `${e}`;
        }
    }

    public getCellValue(row: number, col: number): UnboxedOper {
        return this[loadCellTextSym](row, col);
    }

    public setCellValue(row: number, col: number, value: UnboxedOper) {
        this.workbook.setCellText(row, col, value);
    }

    public async getRange(label: string) {
        const intervals = this.matrix.getSharedIntervalCollection(label);
        const interval = (await intervals.getView()).nextInterval(0);
        return new CellRange(interval, this.localRefToRowCol);
    }

    public async createSlice(sliceId: string, name: string, minRow: number, minCol: number, maxRow: number, maxCol: number): Promise<ITable> {
        await this.runtime.createAndAttachComponent(sliceId, TableSliceType);
        return this.runtime.openComponent<TableSlice>(
            sliceId,
            true,
            [["config", Promise.resolve({ docId: this.runtime.id, name, minRow, minCol, maxRow, maxCol })]]);
    }

    public annotateRows(startRow: number, endRow: number, properties: PropertySet, op?: ICombiningOp) {
        this.maybeRows.annotateRange(properties, startRow, endRow, op);
    }

    public getRowProperties(row: number): PropertySet {
        const client = this.maybeRows.client;
        const mergeTree = client.mergeTree;
        const { segment } = mergeTree.getContainingSegment(row, UniversalSequenceNumber, client.getClientId());
        return segment.properties;
    }

    public annotateCols(startCol: number, endCol: number, properties: PropertySet, op?: ICombiningOp) {
        this.maybeCols.annotateRange(properties, startCol, endCol, op);
    }

    public getColProperties(col: number): PropertySet {
        const client = this.maybeCols.client;
        const mergeTree = client.mergeTree;
        const { segment } = mergeTree.getContainingSegment(col, UniversalSequenceNumber, client.getClientId());
        return segment.properties;
    }

    // For internal use by TableSlice: Please do not use.
    public createInterval(label: string, minRow: number, minCol: number, maxRow: number, maxCol: number) {
        debug(`createInterval(${label}, ${minRow}:${minCol}..${maxRow}:${maxCol})`);
        const start = rowColToPosition(minRow, minCol);
        const end = rowColToPosition(maxRow, maxCol);
        const intervals = this.matrix.getSharedIntervalCollection(label);
        intervals.add(start, end, IntervalType.Simple);
    }

    public insertRows(startRow: number, numRows: number) {
        this.matrix.insertRows(startRow, numRows);
        this.maybeRows!.insert(startRow, new Array(numRows).fill(0));
    }

    public removeRows(startRow: number, numRows: number) {
        this.matrix.removeRows(startRow, numRows);
        this.maybeRows!.remove(startRow, startRow + numRows);
    }

    public insertCols(startCol: number, numCols: number) {
        this.matrix.insertCols(startCol, numCols);
        this.maybeCols!.insert(startCol, new Array(numCols).fill(0));
    }

    public removeCols(startCol: number, numCols: number) {
        this.matrix.removeCols(startCol, numCols);
        this.maybeCols!.remove(startCol, startCol + numCols);
    }

    protected async create() {
        const rows = SharedNumberSequence.create(this.runtime, "rows");
        this.root.set("rows", rows);

        const cols = SharedNumberSequence.create(this.runtime, "cols");
        this.root.set("cols", cols);

        const matrix = SparseMatrix.create(this.runtime, "matrix");
        this.root.set("matrix", matrix);
    }

    protected async opened() {
        this.maybeMatrix = await this.root.wait<SparseMatrix>("matrix");
        this.maybeRows = await this.root.wait<SharedNumberSequence>("rows");
        this.maybeCols = await this.root.wait<SharedNumberSequence>("cols");
        await this.connected;

        this.matrix.on("op", (op, local, target) => {
            if (!local) {
                for (let row = 0; row < this.numRows; row++) {
                    for (let col = 0; col < this.numCols; col++) {
                        this.workbook.setCellText(row, col, this.getCellValue(row, col), /* isExternal: */ true);
                    }
                }
            }

            this.emit("op", op, local, target);
        });

        this.maybeCols.on("op", (...args: any[]) => this.emit("op", ...args));
        this.maybeRows.on("op", (...args: any[]) => this.emit("op", ...args));

        this.maybeWorkbook = new WorkbookAdapter(this);
    }

    private [loadCellTextSym](row: number, col: number): UnboxedOper {
        return this.matrix.getItem(row, col);
    }

    private [storeCellTextSym](row: number, col: number, value: UnboxedOper) {
        this.matrix.setItems(row, col, [value]);
    }

    private [loadCellSym](row: number, col: number): object | undefined {
        return this.matrix.getTag(row, col);
    }

    private [storeCellSym](row: number, col: number, cell: object | undefined) {
        this.matrix.setTag(row, col, cell);
        assert.strictEqual(this[loadCellSym](row, col), cell);
    }

    private readonly localRefToRowCol = (localRef: LocalReference) => {
        const client = this.maybeMatrix.client;
        const mergeTree = client.mergeTree;
        const position = localRef.toPosition(mergeTree, UniversalSequenceNumber, client.getClientId());
        return positionToRowCol(position);
    }
}
