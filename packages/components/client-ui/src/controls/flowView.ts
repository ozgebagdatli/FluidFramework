/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

// tslint:disable:no-bitwise whitespace align switch-default no-string-literal ban-types
// tslint:disable:no-angle-bracket-type-assertion arrow-parens
import { ProgressCollection } from "@chaincode/progress-bars";
import * as api from "@prague/client-api";
import {
    IComponent,
    IGenericBlob,
    IPlatform,
    ISequencedDocumentMessage,
    ISharedComponent,
    IUser,
} from "@prague/container-definitions";
import * as types from "@prague/map";
import * as MergeTree from "@prague/merge-tree";
import {
    ComponentCursorDirection, ComponentDisplayType,
    IComponentCollection, IComponentCursor, IComponentKeyHandlers, IComponentLayout, IComponentRenderHTML,
    IInboundSignalMessage,
} from "@prague/runtime-definitions";
import * as Sequence from "@prague/sequence";
import { ISharedObject } from "@prague/shared-object-common";
import * as assert from "assert";
import * as Geocoder from "geocoder";
import * as Katex from "katex";
// tslint:disable-next-line:no-var-requires
const performanceNow = require("performance-now");
import { isBlock } from "@prague/app-ui";
import { blobUploadHandler, urlToInclusion } from "../blob";
import { SharedWorkbook } from "../calc";
import {
    CharacterCodes,
    Paragraph,
    Table,
} from "../text";
import * as ui from "../ui";
import { Cursor, IRange } from "./cursor";
import * as domutils from "./domutils";
import { KeyCode } from "./keycode";
import * as MathMenu from "./mathMenu";
import { PresenceSignal } from "./presenceSignal";
import * as SearchMenu from "./searchMenu";
import { Status } from "./status";
import { UndoRedoStackManager } from "./undoRedo";

interface IMathViewMarker extends MergeTree.Marker {
    instance?: IMathInstance;
}

function getComponentBlock(marker: MergeTree.Marker): IBlockViewMarker {
    if (marker && marker.properties && marker.properties.crefTest) {
        const crefTest: IReferenceDoc = marker.properties.crefTest;
        if ((!crefTest.layout) || (!crefTest.layout.inline)) {
            return marker as IBlockViewMarker;
        }
    }
}

interface IRenderComponent extends IComponent, IComponentRenderHTML {
}

interface IBlockViewMarker extends MergeTree.Marker {
    instanceP?: Promise<IRenderComponent>;
    instance?: IRenderComponent;
}

interface IComponentViewMarker extends MergeTree.Marker {
    instanceP?: Promise<IComponentRenderHTML>;
    instance?: IComponentRenderHTML;
}

interface IMathCollection extends IComponent, IPlatform {
    create(options?: IMathOptions): IMathInstance;
    getInstance(id: string, options?: IMathOptions): IMathInstance;
}

// the following interfaces should come from the math component but are
// here due to package dependencies

interface IMathOptions {
    displayType?: ComponentDisplayType;
}

export interface IMathInstance extends ISharedComponent, IComponentRenderHTML, IComponentCursor,
    IComponentKeyHandlers, IComponentLayout, SearchMenu.ISearchMenuClient {
    id: string;
    leafId: string;
}

export interface IFlowViewUser extends IUser {
    name: string;
}

export interface IOverlayMarker {
    id: string;
    position: number;
}

export interface ILineDiv extends HTMLDivElement {
    linePos?: number;
    lineEnd?: number;
    contentWidth?: number;
    indentWidth?: number;
    indentSymbol?: Paragraph.ISymbol;
    endPGMarker?: Paragraph.IParagraphMarker;
    breakIndex?: number;
}

interface IRowDiv extends ILineDiv {
    rowView: Table.Row;
}

function findRowParent(lineDiv: ILineDiv) {
    let parent = lineDiv.parentElement as IRowDiv;
    while (parent) {
        if (parent.rowView) {
            return parent;
        }
        parent = parent.parentElement as IRowDiv;
    }
}
interface IRefInclusion {
    marker: MergeTree.Marker;
    exclu: IExcludedRectangle;
}

interface IRefDiv extends HTMLDivElement, IRefInclusion {
}

interface ISegSpan extends HTMLSpanElement {
    seg: MergeTree.TextSegment;
    segPos?: number;
    offset?: number;
    clipOffset?: number;
    textErrorRun?: IRange;
}

interface IRangeInfo {
    elm: HTMLElement;
    node: Node;
    offset: number;
}

type Alt = MergeTree.ProxString<number>;
// TODO: mechanism for intelligent services to publish interfaces like this
interface ITextErrorInfo {
    text: string;
    alternates: Alt[];
    color?: string;
}
function altsToItems(alts: Alt[]) {
    return alts.map((v) => ({ key: v.text }));
}

export interface IFlowViewCmd extends SearchMenu.ISearchMenuCommand<FlowView> {
}

let viewOptions: Object;

const fontSizeStrings = ["8", "9", "10", "11", "12", "14", "16", "18", "20", "24", "32"];
const fontSizeTree = new MergeTree.TST<IFlowViewCmd>();
for (const sizeString of fontSizeStrings) {
    fontSizeTree.put(sizeString, { key: sizeString });
}
const fontSizes = (f: FlowView) => fontSizeTree;
const defaultFontSize = (f: FlowView) => "18";
const cssColorStrings = ["AliceBlue", "AntiqueWhite", "Aqua", "Aquamarine", "Azure", "Beige", "Bisque", "Black",
    "BlanchedAlmond", "Blue", "BlueViolet", "Brown", "BurlyWood", "CadetBlue", "Chartreuse", "Chocolate",
    "Coral", "CornflowerBlue", "Cornsilk", "Crimson", "Cyan", "DarkBlue", "DarkCyan", "DarkGoldenRod",
    "DarkGray", "DarkGrey", "DarkGreen", "DarkKhaki", "DarkMagenta", "DarkOliveGreen", "DarkOrange",
    "DarkOrchid", "DarkRed", "DarkSalmon", "DarkSeaGreen", "DarkSlateBlue", "DarkSlateGray", "DarkSlateGrey",
    "DarkTurquoise", "DarkViolet", "DeepPink", "DeepSkyBlue", "DimGray", "DimGrey", "DodgerBlue", "FireBrick",
    "FloralWhite", "ForestGreen", "Fuchsia", "Gainsboro", "GhostWhite", "Gold", "GoldenRod", "Gray", "Grey",
    "Green", "GreenYellow", "HoneyDew", "HotPink", "IndianRed", "Indigo", "Ivory", "Khaki", "Lavender",
    "LavenderBlush", "LawnGreen", "LemonChiffon", "LightBlue", "LightCoral", "LightCyan",
    "LightGoldenRodYellow", "LightGray", "LightGrey", "LightGreen", "LightPink", "LightSalmon",
    "LightSeaGreen", "LightSkyBlue", "LightSlateGray", "LightSlateGrey", "LightSteelBlue", "LightYellow",
    "Lime", "LimeGreen", "Linen", "Magenta", "Maroon", "MediumAquaMarine", "MediumBlue",
    "MediumOrchid", "MediumPurple", "MediumSeaGreen", "MediumSlateBlue", "MediumSpringGreen",
    "MediumTurquoise", "MediumVioletRed", "MidnightBlue", "MintCream", "MistyRose", "Moccasin", "NavajoWhite",
    "Navy", "OldLace", "Olive", "OliveDrab", "Orange", "OrangeRed", "Orchid", "PaleGoldenRod", "PaleGreen",
    "PaleTurquoise", "PaleVioletRed", "PapayaWhip", "PeachPuff", "Peru", "Pink", "Plum", "PowderBlue",
    "Purple", "RebeccaPurple", "Red", "RosyBrown", "RoyalBlue", "SaddleBrown", "Salmon", "SandyBrown",
    "SeaGreen", "SeaShell", "Sienna", "Silver", "SkyBlue", "SlateBlue", "SlateGray", "SlateGrey",
    "Snow", "SpringGreen", "SteelBlue", "Tan", "Teal", "Thistle", "Tomato", "Turquoise", "Violet", "Wheat",
    "White", "WhiteSmoke", "Yellow", "YellowGreen"];
const cssColorTree = new MergeTree.TST<IFlowViewCmd>();
for (const cssColor of cssColorStrings) {
    fontSizeTree.put(cssColor, { key: cssColor });
}
const cssColors = (f: FlowView) => cssColorTree;
const defaultColor = (f: FlowView) => "Black";

const commands: IFlowViewCmd[] = [
    {
        exec: (c, p, f) => {
            f.setBGImage(dinoImage);
        },
        key: "enable dinosaur",
    },
    {
        exec: (c, p, f) => {
            f.setBGImage(dinoImage, true);
        },
        key: "jettison one dinosaur",
    },
    {
        exec: (c, p, f) => {
            f.setBGImage(mrBennetEyeRoll);
        },
        key: "release the Bennets",
    },
    {
        exec: (c, p, f) => {
            f.setBGImage(mrBennetEyeRoll, true);
        },
        key: "release one Bennet",
    },
    {
        exec: (c, p, f) => {
            f.copyFormat();
        },
        key: "copy format",
    },
    {
        exec: (c, p, f) => {
            f.paintFormat();
        },
        key: "paint format",
    },
    {
        exec: (c, p, f) => {
            f.geocodeAddress();
        },
        key: "geocode",
    },
    {
        exec: (c, p, f) => {
            f.toggleBlockquote();
        },
        key: "blockquote",
    },
    {
        exec: (c, p, f) => {
            f.toggleBold();
        },
        key: "bold",
    },
    {
        exec: (c, p, f) => {
            f.createBookmarks(5000);
        },
        key: "bookmark test: 5000",
    },
    {
        exec: (c, p, f) => {
            f.addCalendarEntries();
        },
        key: "cal create",
    },
    {
        exec: (c, p, f) => {
            f.showCalendarEntries();
        },
        key: "cal show",
    },
    {
        exec: (c, p, f) => {
            f.addSequenceEntry();
        },
        key: "seq +",
    },
    {
        exec: (c, p, f) => {
            f.showSequenceEntries();
        },
        key: "seq show",
    },
    {
        exec: (c, p, f) => {
            f.createComment();
        },
        key: "comment",
    },
    {
        exec: (c, p, f) => {
            f.showCommentText();
        },
        key: "comment text",
    },
    {
        exec: (c, p, f) => {
            f.showKatex();
        },
        key: "katex",
    },
    {
        exec: (c, p, f) => {
            f.setColor("red");
        },
        key: "red",
    },
    {
        exec: (c, p, f) => {
            f.setColor("green");
        },
        key: "green",
    },
    {
        exec: (c, p, f) => {
            f.setColor("gold");
        },
        key: "gold",
    },
    {
        exec: (c, p, f) => {
            f.setColor("pink");
        },
        key: "pink",
    },
    {
        exec: (c, p, f) => {
            f.makeBlink("pink");
        },
        key: "blink-pink",
    },
    {
        exec: (c, p, f) => {
            f.setFont("courier new", "18px");
        },
        key: "Courier font",
    },
    {
        exec: (c, p, f) => {
            f.setFont("tahoma", "18px");
        },
        key: "Tahoma",
        parameters: [
            { name: "size", defaultValue: defaultFontSize, suffix: "px", values: fontSizes },
        ],
    },
    {
        exec: (c, p, f) => {
            f.setPGProps({ header: true });
        },
        key: "Heading 2",
    },
    {
        exec: (c, p, f) => {
            f.setPGProps({ header: null });
        },
        key: "Normal",
    },
    {
        exec: (c, p, f) => {
            f.setFont("georgia", "18px");
        },
        key: "Georgia font",
    },
    {
        exec: (c, p, f) => {
            f.setFont("sans-serif", "18px");
        },
        key: "sans font",
    },
    {
        exec: (c, p, f) => {
            f.setFont("cursive", "18px");
        },
        key: "cursive font",
    },
    {
        exec: (c, p, f) => {
            f.toggleItalic();
        },
        key: "italic",
    },
    {
        exec: (c, p, f) => {
            f.setList();
        },
        key: "list ... 1.)",
    },
    {
        exec: (c, p, f) => {
            f.setList(1);
        },
        key: "list ... \u2022",
    },
    {
        exec: (c, p, f) => {
            showCell(f.cursor.pos, f);
        },
        key: "cell info",
    },
    {
        exec: (c, p, f) => {
            showTable(f.cursor.pos, f);
        },
        key: "table info",
    },
    {
        exec: (c, p, f) => {
            f.tableSummary();
        },
        key: "table summary",
    },
    {
        exec: (c, p, f) => {
            f.showAdjacentBookmark();
        },
        key: "previous bookmark",
    },
    {
        exec: (c, p, f) => {
            f.showAdjacentBookmark(false);
        },
        key: "next bookmark",
    },
    {
        enabled: (f) => {
            return !f.modes.showBookmarks;
        },
        exec: (c, p, f) => {
            f.modes.showBookmarks = true;
            f.tempBookmarks = undefined;
            f.localQueueRender(f.cursor.pos);
        },
        key: "show bookmarks",
    },
    {
        enabled: (f) => {
            return !f.modes.showCursorLocation;
        },
        exec: (c, p, f) => {
            f.modes.showCursorLocation = true;
            f.cursorLocation();
        },
        key: "show cursor location",
    },
    {
        enabled: (f) => {
            return f.modes.showCursorLocation;
        },
        exec: (c, p, f) => {
            f.modes.showCursorLocation = false;
            f.status.remove("cursor");
        },
        key: "hide cursor location",
    },
    {
        enabled: (f) => {
            return f.modes.showBookmarks;
        },
        exec: (c, p, f) => {
            f.modes.showBookmarks = false;
            f.tempBookmarks = undefined;
            f.localQueueRender(f.cursor.pos);
        },
        key: "hide bookmarks",
    },
    {
        enabled: (f) => {
            return !f.modes.showComments;
        },
        exec: (c, p, f) => {
            f.modes.showComments = true;
            f.localQueueRender(f.cursor.pos);
        },
        key: "show comments",
    },
    {
        enabled: (f) => {
            return f.modes.showComments;
        },
        exec: (c, p, f) => {
            f.modes.showComments = false;
            f.localQueueRender(f.cursor.pos);
        },
        key: "hide comments",
    },
    {
        exec: (c, p, f) => {
            f.updatePGInfo(f.cursor.pos - 1);
            Table.createTable(f.cursor.pos, f.sharedString);
            f.localQueueRender(f.cursor.pos);
        },
        key: "table test",
    },
    {
        exec: (c, p, f) => {
            f.insertPhoto();
        },
        key: "insert photo",
    },
    {
        exec: (c, p, f) => {
            f.insertList();
        },
        key: "insert list",
    },
    {
        exec: (c, p, f) => {
            f.addChildFlow();
        },
        key: "cflow test",
    },
    {
        exec: (c, p, f) => {
            f.insertColumn();
        },
        key: "insert column",
    },
    {
        exec: (c, p, f) => {
            f.insertRow();
        },
        key: "insert row",
    },
    {
        exec: (c, p, f) => {
            f.deleteRow();
        },
        key: "delete row",
    },
    {
        exec: (c, p, f) => {
            f.deleteColumn();
        },
        key: "delete column",
    },
    {
        exec: (c, p, f) => {
            f.toggleUnderline();
        },
        key: "underline",
    },
    {
        exec: (c, p, f) => {
            f.insertSheetlet();
        },
        key: "insert sheet",
    },
    {
        exec: (c, p, f) => {
            f.insertInnerComponent("chart", "@chaincode/charts");
        },
        key: "insert chart",
    },
    {
        exec: (c, p, f) => {
            f.insertInnerComponent("map", "@chaincode/pinpoint-editor");
        },
        key: "insert map",
    },
    {
        exec: (c, p, f) => {
            f.insertInnerComponent("code", "@chaincode/monaco");
        },
        key: "insert monaco",
    },
    {
        exec: (c, p, f) => {
            f.insertComponentNew("charts", "@chaincode/charts");
        },
        key: "insert new chart",
    },
    {
        exec: (c, p, f) => {
            f.insertComponentNew("map", "@chaincode/pinpoint-editor");
        },
        key: "insert new map",
    },
    {
        exec: (c, p, f) => {
            f.insertComponentNew("code", "@chaincode/monaco");
        },
        key: "insert new monaco",
    },
    {
        exec: (c, p, f) => {
            f.insertMath();
        },
        key: "insert math",
    },
    {
        exec: (c, p, f) => {
            f.insertMath(false);
        },
        key: "insert math block",
    },
    {
        exec: (c, p, f) => {
            f.insertProgressBar();
        },
        key: "insert progress",
    },
    {
        exec: (c, p, f) => {
            f.insertVideoPlayer();
        },
        key: "insert morton",
    },
    {
        exec: (c, p, f) => {
            (navigator as any).clipboard.readText().then((text) => {
                console.log(`Inserting ${text}`);
                f.insertDocument(text);
            });
        },
        key: "paste component",
    },
];

export function moveMarker(flowView: FlowView, fromPos: number, toPos: number) {
    flowView.sharedString.cut(fromPos, fromPos + 1, "inclusion");
    flowView.sharedString.paste(toPos, "inclusion");
}

function elmOffToSegOff(elmOff: IRangeInfo, span: HTMLSpanElement) {
    if ((elmOff.elm !== span) && (elmOff.elm.parentElement !== span)) {
        console.log("did not hit span");
    }
    let offset = elmOff.offset;
    let prevSib = elmOff.node.previousSibling;
    if ((!prevSib) && (elmOff.elm !== span)) {
        prevSib = elmOff.elm.previousSibling;
    }
    while (prevSib) {
        switch (prevSib.nodeType) {
            case Node.ELEMENT_NODE:
                const innerSpan = prevSib as HTMLSpanElement;
                offset += innerSpan.innerText.length;
                break;
            case Node.TEXT_NODE:
                offset += prevSib.nodeValue.length;
                break;
            default:
                break;
        }
        prevSib = prevSib.previousSibling;
    }
    return offset;
}

const baseURI = typeof document !== "undefined" ? document.location.origin : "";
const dinoImage = `url("${baseURI}/public/images/Dino3.jpg")`;
const underlineStringURL = `url("${baseURI}/public/images/underline.gif") bottom repeat-x`;
const underlinePaulStringURL = `url("${baseURI}/public/images/underline-paul.gif") bottom repeat-x`;
const underlinePaulGrammarStringURL = `url("${baseURI}/public/images/underline-paulgrammar.gif") bottom repeat-x`;
const underlinePaulGoldStringURL = `url("${baseURI}/public/images/underline-gold.gif") bottom repeat-x`;
const mrBennetEyeRoll = `url("${baseURI}/public/images/bennet-eye-roll.gif")`;

// global until remove old render
let textErrorRun: IRange;

interface ILineContext {
    lineDiv: ILineDiv;
    contentDiv: HTMLDivElement;
    lineDivHeight: number;
    flowView: FlowView;
    span: ISegSpan;
    deferredAttach?: boolean;
    mathSegpos?: number;
    mathMode: boolean;
    mathBuffer: string;
    reRenderList?: ILineDiv[];
    pgMarker: Paragraph.IParagraphMarker;
}

export interface IDocumentContext {
    wordSpacing: number;
    headerFontstr: string;
    headerDivHeight: number;
    fontstr: string;
    defaultLineDivHeight: number;
    pgVspace: number;
    cellVspace: number;
    cellHMargin: number;
    cellTopMargin: number;
    tableVspace: number;
    indentWidthThreshold: number;
    viewportDiv: HTMLDivElement;
}

function buildDocumentContext(viewportDiv: HTMLDivElement) {
    const fontstr = "18px Times";
    viewportDiv.style.font = fontstr;
    const headerFontstr = "22px Times";
    const wordSpacing = domutils.getTextWidth(" ", fontstr);
    const headerDivHeight = 32;
    const computedStyle = window.getComputedStyle(viewportDiv);
    const defaultLineHeight = 1.2;
    const h = parseInt(computedStyle.fontSize, 10);
    const defaultLineDivHeight = Math.round(h * defaultLineHeight);
    const pgVspace = Math.round(h * 0.5);
    const cellVspace = 3;
    const tableVspace = pgVspace;
    const cellTopMargin = 3;
    const cellHMargin = 3;
    const indentWidthThreshold = 600;
    return {
        cellHMargin, cellTopMargin, cellVspace, defaultLineDivHeight, fontstr, headerDivHeight, headerFontstr,
        indentWidthThreshold, pgVspace, tableVspace, viewportDiv, wordSpacing,
    } as IDocumentContext;
}

function showPresence(presenceX: number, lineContext: ILineContext, presenceInfo: ILocalPresenceInfo) {
    if (!presenceInfo.cursor) {
        presenceInfo.cursor = new FlowCursor(lineContext.flowView.viewportDiv, presenceInfo.xformPos);
        presenceInfo.cursor.addPresenceInfo(presenceInfo);
    }
    presenceInfo.cursor.assignToLine(presenceX, lineContext.lineDivHeight, lineContext.lineDiv);
    presenceInfo.fresh = false;
}

function showPositionEndOfLine(lineContext: ILineContext, presenceInfo?: ILocalPresenceInfo) {
    if (lineContext.deferredAttach) {
        addToRerenderList(lineContext);
    } else {
        if (lineContext.span) {
            const cursorBounds = lineContext.span.getBoundingClientRect();
            const lineDivBounds = lineContext.lineDiv.getBoundingClientRect();
            const cursorX = cursorBounds.width + (cursorBounds.left - lineDivBounds.left);
            if (!presenceInfo) {
                lineContext.flowView.cursor.assignToLine(cursorX, lineContext.lineDivHeight, lineContext.lineDiv);
            } else {
                showPresence(cursorX, lineContext, presenceInfo);
            }
        } else {
            if (lineContext.lineDiv.indentWidth !== undefined) {
                if (!presenceInfo) {
                    lineContext.flowView.cursor.assignToLine(
                        lineContext.lineDiv.indentWidth, lineContext.lineDivHeight, lineContext.lineDiv);
                } else {
                    showPresence(lineContext.lineDiv.indentWidth, lineContext, presenceInfo);
                }
            } else {
                if (!presenceInfo) {
                    lineContext.flowView.cursor.assignToLine(0, lineContext.lineDivHeight, lineContext.lineDiv);
                } else {
                    showPresence(0, lineContext, presenceInfo);
                }
            }
        }
    }
}

function addToRerenderList(lineContext: ILineContext) {
    if (!lineContext.reRenderList) {
        lineContext.reRenderList = [lineContext.lineDiv];
    } else {
        lineContext.reRenderList.push(lineContext.lineDiv);
    }
}

function showPositionInLine(
    lineContext: ILineContext,
    textStartPos: number,
    text: string,
    cursorPos: number,
    presenceInfo?: ILocalPresenceInfo) {

    if (lineContext.deferredAttach) {
        addToRerenderList(lineContext);
    } else {
        let posX: number;
        const lineDivBounds = lineContext.lineDiv.getBoundingClientRect();
        if (cursorPos > textStartPos) {
            const preCursorText = text.substring(0, cursorPos - textStartPos);
            const temp = lineContext.span.innerText;
            lineContext.span.innerText = preCursorText;
            const cursorBounds = lineContext.span.getBoundingClientRect();
            posX = cursorBounds.width + (cursorBounds.left - lineDivBounds.left);
            // console.log(`cbounds w ${cursorBounds.width} posX ${posX} ldb ${lineDivBounds.left}`);
            lineContext.span.innerText = temp;
        } else {
            const cursorBounds = lineContext.span.getBoundingClientRect();
            posX = cursorBounds.left - lineDivBounds.left;
            // console.log(`cbounds whole l ${cursorBounds.left} posX ${posX} ldb ${lineDivBounds.left}`);
        }
        if (!presenceInfo) {
            lineContext.flowView.cursor.assignToLine(posX, lineContext.lineDivHeight, lineContext.lineDiv);
        } else {
            showPresence(posX, lineContext, presenceInfo);
        }
    }
}

function endRenderSegments(marker: MergeTree.Marker) {
    return (marker.hasTileLabel("pg") ||
        ((marker.hasRangeLabel("cell") &&
            (marker.refType & MergeTree.ReferenceType.NestEnd))));
}

const wordHeadingColor = "rgb(47, 84, 150)";

/**
 * Ensure the given 'element' is focusable and restore the default behavior of HTML intrinsic
 * controls (e.g., <input>) within the element.
 */
function allowDOMEvents(element: HTMLElement) {
    // Ensure element can receive DOM focus (see Example 1):
    // https://www.w3.org/WAI/GL/WCAG20/WD-WCAG20-TECHS/SCR29.html

    // Note: 'tabIndex' should never be NaN, undefined, etc., but use of negation below ensures
    //       these degenerate values will also be replaced with 0.
    if (!(element.tabIndex >= 0)) {
        element.tabIndex = 0;
    }

    // TODO: Unsure if the empty/overlapping line divs overlapping inclusions are intentional?
    //
    // Elevate elements expecting DOM focus within their stacking container to ensure they
    // appear above empty line divs generated after their marker.
    element.style.zIndex = "1";

    // Elements of a component do not expect whitespace to be preserved.  Revert the white-space
    // 'pre' style applied by the lineDiv.
    element.style.whiteSpace = "normal";

    // Stops these events from bubbling back up to the FlowView when the <div> is focused.
    // The FlowView invokes 'preventDefault()' on these events, which blocks the behavior of
    // HTML intrinsic controls like <input />.
    element.addEventListener("mousedown", (e) => { e.stopPropagation(); });
    element.addEventListener("mousemove", (e) => { e.stopPropagation(); });
    element.addEventListener("mouseup", (e) => { e.stopPropagation(); });
    element.addEventListener("keydown", (e) => { e.stopPropagation(); });
    element.addEventListener("keypress", (e) => { e.stopPropagation(); });
    element.addEventListener("keyup", (e) => { e.stopPropagation(); });

    return element;
}

interface IMathEndMarker extends MergeTree.Marker {
    outerSpan: HTMLSpanElement;
}

function isMathComponentView(marker: MergeTree.Marker) {
    if (marker.hasProperty("crefTest")) {
        const refInfo = marker.properties.crefTest as IReferenceDoc;
        return refInfo.type.name === "math";
    }
}

function isComponentView(marker: MergeTree.Marker) {
    if (marker.hasProperty("crefTest")) {
        const refInfo = marker.properties.crefTest as IReferenceDoc;
        return refInfo.type.name === "component";
    }
}

function renderSegmentIntoLine(
    segment: MergeTree.ISegment, segpos: number, refSeq: number,
    clientId: number, start: number, end: number, lineContext: ILineContext) {
    if (lineContext.lineDiv.linePos === undefined) {
        lineContext.lineDiv.linePos = segpos + start;
        lineContext.lineDiv.lineEnd = lineContext.lineDiv.linePos;
    }
    if (MergeTree.TextSegment.is(segment)) {
        if (lineContext.mathMode) {
            // will be whole segment
            // TODO: show math box if cursor in math
            lineContext.mathBuffer += segment.text;
        } else {
            if (start < 0) {
                start = 0;
            }
            if (end > segment.cachedLength) {
                end = segment.cachedLength;
            }
            const text = segment.text.substring(start, end);
            const textStartPos = segpos + start;
            const textEndPos = segpos + end;
            lineContext.span = makeSegSpan(lineContext.flowView, text, segment, start, segpos);
            if ((lineContext.lineDiv.endPGMarker) && (lineContext.lineDiv.endPGMarker.properties.header)) {
                lineContext.span.style.color = wordHeadingColor;
            }
            lineContext.contentDiv.appendChild(lineContext.span);
            lineContext.lineDiv.lineEnd += text.length;
            if ((lineContext.flowView.cursor.pos >= textStartPos) && (lineContext.flowView.cursor.pos <= textEndPos)) {
                showPositionInLine(lineContext, textStartPos, text, lineContext.flowView.cursor.pos);
            }
            const presenceInfo = lineContext.flowView.presenceInfoInRange(textStartPos, textEndPos);
            if (presenceInfo) {
                showPositionInLine(lineContext, textStartPos, text, presenceInfo.xformPos, presenceInfo);
            }
        }
    } else if (MergeTree.Marker.is(segment)) {
        // console.log(`marker pos: ${segpos}`);

        // If the marker is a simple reference, see if it's types is registered as an external
        // component.
        if (segment.refType === MergeTree.ReferenceType.Simple) {
            const typeName = segment.properties.ref && segment.properties.ref.type.name;
            const marker = segment as MergeTree.Marker;
            if (isMathComponentView(marker)) {
                const span = document.createElement("span");
                const mathViewMarker = marker as IMathViewMarker;
                if (!mathViewMarker.instance) {
                    lineContext.flowView.loadMath(mathViewMarker);
                }
                mathViewMarker.instance.render(span);
                mathViewMarker.properties.cachedElement = span;
                lineContext.contentDiv.appendChild(span);
            } else if (isComponentView(marker)) {
                const span = document.createElement("span");
                const componentMarker = marker as IComponentViewMarker;

                // Delay load the instance if not available
                if (!componentMarker.instance) {
                    if (!componentMarker.instanceP) {
                        componentMarker.instanceP = lineContext.flowView.collabDocument.context.hostRuntime
                            .request({ url: `/${componentMarker.properties.leafId}` })
                            .then(async (response) => {
                                if (response.status !== 200 || response.mimeType !== "prague/component") {
                                    return Promise.reject(response);
                                }

                                const component = response.value as IComponent;
                                const viewable = component.query<IComponentRenderHTML>("IComponentRenderHTML");
                                if (!viewable) {
                                    return Promise.reject("component is not viewable");
                                }

                                return viewable;
                            });

                        componentMarker.instanceP.then((instance) => {
                            // TODO how do I trigger a re-render?
                            componentMarker.instance = instance;
                        });
                    }
                } else {
                    componentMarker.instance.render(span, ComponentDisplayType.Inline);
                    componentMarker.properties.cachedElement = span;
                    lineContext.contentDiv.appendChild(span);
                }
            } else {
                const maybeComponent = ui.refTypeNameToComponent.get(typeName);
                // If it is a registered external component, ask it to render itself to HTML and
                // insert the divs here.
                if (maybeComponent) {
                    const context = new ui.FlowViewContext(
                        document.createElement("canvas").getContext("2d"),
                        lineContext.lineDiv.style,
                        lineContext.flowView.services,
                    );

                    const newElement = maybeComponent.upsert(
                        segment.properties.state,
                        context,
                        segment.properties.cachedElement,
                    );

                    if (newElement !== segment.properties.cachedElement) {
                        segment.properties.cachedElement = newElement;
                        allowDOMEvents(newElement);
                    }

                    lineContext.contentDiv.appendChild(newElement);
                }
            }
        }

        if (segment.hasTileLabel("math")) {
            if (segment.properties.mathStart) {
                lineContext.mathMode = true;
                lineContext.mathSegpos = segpos;
            } else {
                const mathMarker = segment as MathMenu.IMathMarker;
                lineContext.span = makeMathSpan(lineContext.mathSegpos, 0);
                lineContext.span.style.marginLeft = "2px";
                lineContext.span.style.marginTop = "4px";
                lineContext.span.style.marginRight = "2px";
                if (mathMarker.mathTokens === undefined) {
                    MathMenu.initMathMarker(mathMarker, lineContext.mathBuffer);
                }
                const cpos = lineContext.flowView.cursor.pos;
                let cursorPresent = false;
                if ((cpos > lineContext.mathSegpos) && (cpos <= segpos)) {
                    lineContext.span.style.borderLeft = "solid orange 2px";
                    lineContext.span.style.borderRight = "solid orange 2px";
                    if ((!mathMarker.mathViewBuffer) || (cpos === segpos)) {
                        mathMarker.mathCursor = lineContext.mathBuffer.length;
                        lineContext.mathBuffer += MathMenu.cursorTex;
                    } else {
                        // showCursor
                        lineContext.mathBuffer = lineContext.mathBuffer.substring(0, mathMarker.mathCursor) +
                            MathMenu.cursorTex +
                            lineContext.mathBuffer.substring(mathMarker.mathCursor);
                    }
                    cursorPresent = true;
                    lineContext.flowView.cursor.assignToLine(0, lineContext.lineDivHeight,
                        lineContext.lineDiv, false);
                }
                lineContext.mathBuffer = MathMenu.boxEmptyParam(lineContext.mathBuffer);
                mathMarker.mathViewBuffer = lineContext.mathBuffer;
                Katex.render(lineContext.mathBuffer, lineContext.span,
                    { throwOnError: false });
                if (cursorPresent) {
                    const cursorElement = domutils.findFirstMatch(lineContext.span, elm => {
                        return elm.style && (elm.style.color === MathMenu.cursorColor);
                    });
                    if (cursorElement) {
                        cursorElement.classList.add("blinking");
                    }
                }
                lineContext.contentDiv.appendChild(lineContext.span);
                lineContext.lineDiv.lineEnd += lineContext.mathBuffer.length;
                lineContext.mathBuffer = "";
                lineContext.mathMode = false;
                const mathEndMarker = segment as IMathEndMarker;
                mathEndMarker.outerSpan = lineContext.span;
            }
        }

        if (endRenderSegments(segment)) {
            if (lineContext.flowView.cursor.pos === segpos) {
                showPositionEndOfLine(lineContext);
            } else {
                const presenceInfo = lineContext.flowView.presenceInfoInRange(segpos, segpos);
                if (presenceInfo) {
                    showPositionEndOfLine(lineContext, presenceInfo);
                }
            }
            return false;
        } else {
            lineContext.lineDiv.lineEnd++;
        }
    }
    return true;
}

function findLineDiv(pos: number, flowView: FlowView, dive = false) {
    return flowView.lineDivSelect((elm) => {
        if ((elm.linePos <= pos) && (elm.lineEnd > pos)) {
            return elm;
        }
    }, flowView.viewportDiv, dive);
}

function decorateLineDiv(lineDiv: ILineDiv, lineFontstr: string, lineDivHeight: number) {
    const indentSymbol = lineDiv.indentSymbol;
    let indentFontstr = lineFontstr;
    if (indentSymbol.font) {
        indentFontstr = indentSymbol.font;
    }
    const em = Math.round(domutils.getTextWidth("M", lineFontstr));
    const symbolWidth = domutils.getTextWidth(indentSymbol.text, indentFontstr);
    const symbolDiv = makeContentDiv(
        new ui.Rectangle(
            lineDiv.indentWidth - Math.floor(em + symbolWidth), 0, symbolWidth, lineDivHeight), indentFontstr);
    symbolDiv.innerText = indentSymbol.text;
    lineDiv.appendChild(symbolDiv);
}

function reRenderLine(lineDiv: ILineDiv, flowView: FlowView, docContext: IDocumentContext) {
    if (lineDiv) {
        const outerViewportBounds = ui.Rectangle.fromClientRect(flowView.viewportDiv.getBoundingClientRect());
        const lineDivBounds = lineDiv.getBoundingClientRect();
        const lineDivHeight = lineDivBounds.height;
        domutils.clearSubtree(lineDiv);
        let contentDiv = lineDiv;
        if (lineDiv.indentSymbol) {
            decorateLineDiv(lineDiv, lineDiv.style.font, lineDivHeight);
        }
        if (lineDiv.indentWidth) {
            contentDiv = makeContentDiv(new ui.Rectangle(lineDiv.indentWidth, 0, lineDiv.contentWidth,
                lineDivHeight), lineDiv.style.font);
            lineDiv.appendChild(contentDiv);
        }
        const lineContext = {
            contentDiv,
            flowView,
            lineDiv,
            lineDivHeight,
            markerPos: 0,
            mathBuffer: "",
            mathMode: false,
            outerViewportBounds,
            pgMarker: undefined,
            span: undefined,
        } as ILineContext;
        const lineEnd = lineDiv.lineEnd;
        let end = lineEnd;
        if (end === lineDiv.linePos) {
            end++;
        }
        flowView.client.mergeTree.mapRange({ leaf: renderSegmentIntoLine }, MergeTree.UniversalSequenceNumber,
            flowView.client.getClientId(), lineContext, lineDiv.linePos, end);
        lineDiv.lineEnd = lineEnd;
        showBookmarks(flowView, lineDiv.linePos,
            lineEnd, lineDiv.style.font, lineDivHeight, lineDiv.breakIndex, docContext,
            contentDiv, lineDiv.endPGMarker);
    }
}

function buildIntervalBlockStyle(properties: MergeTree.PropertySet, startX: number, endX: number,
    height: number, leftInBounds: boolean, rightInBounds: boolean,
    contentDiv: HTMLDivElement, client: MergeTree.Client) {
    const bookmarkDiv = document.createElement("div");
    let bookmarkRect: ui.Rectangle;
    bookmarkRect = new ui.Rectangle(startX, 0, endX - startX, height);
    bookmarkRect.conformElement(bookmarkDiv);
    contentDiv.appendChild(bookmarkDiv);
    if (leftInBounds) {
        bookmarkDiv.style.borderTopLeftRadius = "5px";
        bookmarkDiv.style.borderLeft = "1px solid gray";
        bookmarkDiv.style.borderTop = "1px solid gray";
    }
    if (rightInBounds) {
        bookmarkDiv.style.borderBottomRightRadius = "5px";
        bookmarkDiv.style.borderRight = "1px solid gray";
        bookmarkDiv.style.borderBottom = "1px solid gray";
    }
    bookmarkDiv.style.pointerEvents = "none";
    bookmarkDiv.style.backgroundColor = "lightgray";
    bookmarkDiv.style.opacity = "0.3";
    if (properties) {
        if (properties["bgColor"]) {
            bookmarkDiv.style.backgroundColor = properties["bgColor"];
        } else if (properties["clid"]) {
            const clientId = client.getOrAddShortClientId(properties["clid"]);
            const bgColor = presenceColors[clientId % presenceColors.length];
            bookmarkDiv.style.backgroundColor = bgColor;
            bookmarkDiv.style.opacity = "0.08";
        }
    }
    bookmarkDiv.style.zIndex = "2";
}

function buildIntervalTieStyle(properties: MergeTree.PropertySet, startX: number, endX: number,
    lineDivHeight: number, leftInBounds: boolean, rightInBounds: boolean,
    contentDiv: HTMLDivElement, client: MergeTree.Client) {
    const bookmarkDiv = document.createElement("div");
    let bookmarkRect: ui.Rectangle;
    const bookendDiv1 = document.createElement("div");
    const bookendDiv2 = document.createElement("div");
    const tenthHeight = Math.max(1, Math.floor(lineDivHeight / 10));
    const halfHeight = Math.floor(lineDivHeight >> 1);
    bookmarkRect = new ui.Rectangle(startX, halfHeight - tenthHeight,
        endX - startX, 2 * tenthHeight);
    bookmarkRect.conformElement(bookmarkDiv);
    contentDiv.appendChild(bookmarkDiv);
    new ui.Rectangle(startX, 0, 3, lineDivHeight).conformElement(bookendDiv1);
    if (leftInBounds) {
        contentDiv.appendChild(bookendDiv1);
    }
    new ui.Rectangle(endX - 3, 0, 3, lineDivHeight).conformElement(bookendDiv2);
    if (rightInBounds) {
        contentDiv.appendChild(bookendDiv2);
    }

    bookmarkDiv.style.pointerEvents = "none";
    bookmarkDiv.style.backgroundColor = "lightgray";
    bookendDiv1.style.backgroundColor = "lightgray";
    bookendDiv2.style.backgroundColor = "lightgray";
    if (properties && properties["clid"]) {
        const clientId = client.getOrAddShortClientId(properties["clid"]);
        const bgColor = presenceColors[clientId % presenceColors.length];
        bookmarkDiv.style.backgroundColor = bgColor;
        bookendDiv1.style.backgroundColor = bgColor;
        bookendDiv2.style.backgroundColor = bgColor;
    }
    bookmarkDiv.style.opacity = "0.5";
    bookmarkDiv.style.zIndex = "2";
    bookendDiv1.style.opacity = "0.5";
    bookendDiv1.style.zIndex = "2";
    bookendDiv2.style.opacity = "0.5";
    bookendDiv2.style.zIndex = "2";
}

function getWidthInLine(endPGMarker: Paragraph.IParagraphMarker, breakIndex: number,
    defaultFontstr: string, offset: number) {
    let itemIndex = endPGMarker.cache.breaks[breakIndex].startItemIndex;
    let w = 0;
    while (offset > 0) {
        const item = endPGMarker.itemCache.items[itemIndex];
        if (!item || (item.type === Paragraph.ParagraphItemType.Marker)) {
            itemIndex++;
            break;
        }
        const blockItem = <Paragraph.IPGBlock>item;
        if (blockItem.text.length > offset) {
            const fontstr = item.fontstr || defaultFontstr;
            const subw = domutils.getTextWidth(blockItem.text.substring(0, offset), fontstr);
            return Math.floor(w + subw);
        } else {
            w += item.width;
        }
        offset -= blockItem.text.length;
        itemIndex++;
    }
    return Math.round(w);
}

function showBookmark(properties: MergeTree.PropertySet, lineText: string,
    start: number, end: number, lineStart: number, endPGMarker: Paragraph.IParagraphMarker,
    computedEnd: number, lineFontstr: string, lineDivHeight: number, lineBreakIndex: number,
    docContext: IDocumentContext, contentDiv: HTMLDivElement, client: MergeTree.Client, useTie = false) {
    let startX: number;
    let height = lineDivHeight;
    if (start >= lineStart) {
        startX = getWidthInLine(endPGMarker, lineBreakIndex, lineFontstr, start - lineStart);
    } else {
        startX = 0;
    }
    let endX: number;
    if (end <= computedEnd) {
        endX = getWidthInLine(endPGMarker, lineBreakIndex, lineFontstr, end - lineStart);
    } else {
        if (lineBreakIndex === (endPGMarker.cache.breaks.length - 1)) {
            height += docContext.pgVspace;
        }
        endX = getWidthInLine(endPGMarker, lineBreakIndex, lineFontstr, computedEnd - lineStart);
    }
    if (useTie) {
        buildIntervalTieStyle(properties, startX, endX, lineDivHeight,
            start >= lineStart, end <= computedEnd, contentDiv, client);
    } else {
        buildIntervalBlockStyle(properties, startX, endX, height,
            start >= lineStart, end <= computedEnd, contentDiv, client);
    }
}

function showBookmarks(flowView: FlowView, lineStart: number, lineEnd: number,
    lineFontstr: string, lineDivHeight: number, lineBreakIndex: number,
    docContext: IDocumentContext, contentDiv: HTMLDivElement, endPGMarker: Paragraph.IParagraphMarker) {
    const sel = flowView.cursor.getSelection();
    let havePresenceSel = false;
    for (const localPresenceInfo of flowView.presenceVector) {
        if (localPresenceInfo && (localPresenceInfo.markXformPos !== localPresenceInfo.xformPos)) {
            havePresenceSel = true;
            break;
        }
    }
    if (flowView.bookmarks || flowView.comments || sel || havePresenceSel) {
        const client = flowView.client;
        const computedEnd = lineEnd;
        const bookmarks = flowView.bookmarks.findOverlappingIntervals(lineStart, computedEnd);
        const comments = flowView.commentsView.findOverlappingIntervals(lineStart, computedEnd);
        const lineText = flowView.sharedString.getText(lineStart, computedEnd);
        if (sel && ((sel.start < lineEnd) && (sel.end > lineStart))) {
            showBookmark(undefined, lineText, sel.start, sel.end, lineStart, endPGMarker,
                computedEnd, lineFontstr, lineDivHeight, lineBreakIndex, docContext, contentDiv, client);
        }
        if (havePresenceSel) {
            for (const localPresenceInfo of flowView.presenceVector) {
                if (localPresenceInfo && (localPresenceInfo.markXformPos !== localPresenceInfo.xformPos)) {
                    const presenceStart = Math.min(localPresenceInfo.markXformPos, localPresenceInfo.xformPos);
                    const presenceEnd = Math.max(localPresenceInfo.markXformPos, localPresenceInfo.xformPos);
                    if ((presenceStart < lineEnd) && (presenceEnd > lineStart)) {
                        showBookmark({ clid: flowView.client.getLongClientId(localPresenceInfo.clientId) },
                            lineText, presenceStart, presenceEnd, lineStart, endPGMarker,
                            computedEnd, lineFontstr, lineDivHeight, lineBreakIndex, docContext, contentDiv, client);
                    }
                }
            }
        }
        if (flowView.tempBookmarks && (!flowView.modes.showBookmarks)) {
            for (const b of flowView.tempBookmarks) {
                if (b.overlapsPos(client.mergeTree, lineStart, lineEnd)) {
                    const start = b.start.toPosition(client.mergeTree, client.getCurrentSeq(),
                        client.getClientId());
                    const end = b.end.toPosition(client.mergeTree, client.getCurrentSeq(),
                        client.getClientId());
                    showBookmark(b.properties, lineText, start, end, lineStart,
                        endPGMarker, computedEnd, lineFontstr, lineDivHeight, lineBreakIndex,
                        docContext, contentDiv, client, true);
                }
            }
        }
        if (bookmarks && flowView.modes.showBookmarks) {
            for (const b of bookmarks) {
                const start = b.start.toPosition(client.mergeTree, client.getCurrentSeq(),
                    client.getClientId());
                const end = b.end.toPosition(client.mergeTree, client.getCurrentSeq(),
                    client.getClientId());
                showBookmark(b.properties, lineText, start, end, lineStart,
                    endPGMarker, computedEnd, lineFontstr, lineDivHeight, lineBreakIndex,
                    docContext, contentDiv, client, true);
            }
        }
        if (comments && flowView.modes.showComments) {
            for (const comment of comments) {
                const start = comment.start.toPosition(client.mergeTree, client.getCurrentSeq(),
                    client.getClientId());
                const end = comment.end.toPosition(client.mergeTree, client.getCurrentSeq(),
                    client.getClientId());
                comment.addProperties({ bgColor: "gold" });
                showBookmark(comment.properties, lineText, start, end, lineStart,
                    endPGMarker, computedEnd, lineFontstr, lineDivHeight, lineBreakIndex,
                    docContext, contentDiv, client);
            }
        }
    }
}

function makeContentDiv(r: ui.Rectangle, lineFontstr) {
    const contentDiv = document.createElement("div");
    contentDiv.style.font = lineFontstr;
    contentDiv.style.whiteSpace = "pre";
    contentDiv.onclick = (e) => {
        const targetDiv = e.target as HTMLDivElement;
        if (targetDiv.lastElementChild) {
            // tslint:disable-next-line:max-line-length
            console.log(`div click at ${e.clientX},${e.clientY} rightmost span with text ${targetDiv.lastElementChild.innerHTML}`);
        }
    };
    r.conformElement(contentDiv);
    return contentDiv;
}

function isInnerCell(cellView: ICellView, layoutInfo: ILayoutContext) {
    return (!layoutInfo.startingPosStack) || (!layoutInfo.startingPosStack.cell) ||
        (layoutInfo.startingPosStack.cell.empty()) ||
        (layoutInfo.startingPosStack.cell.items.length === (layoutInfo.stackIndex + 1));
}

interface ICellView extends Table.Cell {
    viewport: Viewport;
    renderOutput: IRenderOutput;
    borderRect: HTMLElement;
    svgElm: HTMLElement;
}

const svgNS = "http://www.w3.org/2000/svg";

function createSVGWrapper(w: number, h: number) {
    const svg = document.createElementNS(svgNS, "svg") as any as HTMLElement;
    svg.style.zIndex = "-1";
    svg.setAttribute("width", w.toString());
    svg.setAttribute("height", h.toString());
    return svg;
}

function createSVGRect(r: ui.Rectangle) {
    const rect = document.createElementNS(svgNS, "rect") as any as HTMLElement;
    rect.setAttribute("x", r.x.toString());
    rect.setAttribute("y", r.y.toString());
    rect.setAttribute("width", r.width.toString());
    rect.setAttribute("height", r.height.toString());
    rect.setAttribute("stroke", "darkgrey");
    rect.setAttribute("stroke-width", "1px");
    rect.setAttribute("fill", "none");
    return rect;
}

function layoutCell(
    cellView: ICellView, layoutInfo: ILayoutContext, targetTranslation: string, defer = false,
    leftmost = false, top = false) {
    const cellRect = new ui.Rectangle(0, 0, cellView.specWidth, 0);
    const cellViewportWidth = cellView.specWidth - (2 * layoutInfo.docContext.cellHMargin);
    const cellViewportRect = new ui.Rectangle(layoutInfo.docContext.cellHMargin, 0,
        cellViewportWidth, 0);
    const cellDiv = document.createElement("div");
    cellView.div = cellDiv;
    cellRect.conformElementOpenHeight(cellDiv);
    const transferDeferredHeight = false;

    cellView.viewport = new Viewport(layoutInfo.viewport.remainingHeight(),
        document.createElement("div"), cellViewportWidth);
    cellViewportRect.conformElementOpenHeight(cellView.viewport.div);
    cellDiv.appendChild(cellView.viewport.div);
    cellView.viewport.vskip(layoutInfo.docContext.cellTopMargin);

    const cellLayoutInfo = {
        deferredAttach: true,
        docContext: layoutInfo.docContext,
        endMarker: cellView.endMarker,
        flowView: layoutInfo.flowView,
        requestedPosition: layoutInfo.requestedPosition,
        stackIndex: layoutInfo.stackIndex,
        startingPosStack: layoutInfo.startingPosStack,
        viewport: cellView.viewport,
    } as ILayoutContext;
    // TODO: deferred height calculation for starting in middle of box
    if (isInnerCell(cellView, layoutInfo)) {
        const cellPos = getOffset(layoutInfo.flowView, cellView.marker);
        cellLayoutInfo.startPos = cellPos + cellView.marker.cachedLength;
    } else {
        const nextTable = layoutInfo.startingPosStack.table.items[layoutInfo.stackIndex + 1];
        cellLayoutInfo.startPos = getOffset(layoutInfo.flowView, nextTable as MergeTree.Marker);
        cellLayoutInfo.stackIndex = layoutInfo.stackIndex + 1;
    }
    if (!cellView.emptyCell) {
        cellView.renderOutput = renderFlow(cellLayoutInfo, targetTranslation, defer);
        if (cellView.additionalCellMarkers) {
            for (const cellMarker of cellView.additionalCellMarkers) {
                cellLayoutInfo.endMarker = cellMarker.cell.endMarker;
                const cellPos = getOffset(layoutInfo.flowView, cellMarker);
                cellLayoutInfo.startPos = cellPos + cellMarker.cachedLength;
                const auxRenderOutput = renderFlow(cellLayoutInfo, targetTranslation, defer);
                cellView.renderOutput.deferredHeight += auxRenderOutput.deferredHeight;
                cellView.renderOutput.overlayMarkers =
                    cellView.renderOutput.overlayMarkers.concat(auxRenderOutput.overlayMarkers);
                cellView.renderOutput.viewportEndPos = auxRenderOutput.viewportEndPos;
            }
        }
        cellView.viewport.vskip(layoutInfo.docContext.cellVspace);
        if (transferDeferredHeight && (cellView.renderOutput.deferredHeight > 0)) {
            layoutInfo.deferUntilHeight = cellView.renderOutput.deferredHeight;
        }
    } else {
        cellView.viewport.vskip(layoutInfo.docContext.defaultLineDivHeight);
        cellView.viewport.vskip(layoutInfo.docContext.cellVspace);
        cellView.renderOutput = {
            deferredHeight: 0, overlayMarkers: [],
            viewportEndPos: cellLayoutInfo.startPos + 3,
            viewportStartPos: cellLayoutInfo.startPos,
        };
    }
    cellView.renderedHeight = cellLayoutInfo.viewport.getLineTop();
    cellView.svgElm = createSVGWrapper(cellRect.width, cellView.renderedHeight);
    cellView.borderRect = createSVGRect(new ui.Rectangle(0, 0, cellRect.width, cellView.renderedHeight));
    cellView.svgElm.appendChild(cellView.borderRect);
    cellView.div.appendChild(cellView.svgElm);
    if (cellLayoutInfo.reRenderList) {
        if (!layoutInfo.reRenderList) {
            layoutInfo.reRenderList = [];
        }
        for (const lineDiv of cellLayoutInfo.reRenderList) {
            layoutInfo.reRenderList.push(lineDiv);
        }
    }
}

function renderTable(
    table: Table.ITableMarker,
    docContext: IDocumentContext,
    layoutInfo: ILayoutContext,
    targetTranslation: string,
    defer = false) {

    const flowView = layoutInfo.flowView;
    const mergeTree = flowView.client.mergeTree;
    const tablePos = mergeTree.getOffset(table, MergeTree.UniversalSequenceNumber, flowView.client.getClientId());
    let tableView = table.table;
    if (!tableView) {
        tableView = Table.parseTable(table, tablePos, flowView.sharedString, makeFontInfo(docContext));
    }
    if (!tableView) {
        return;
    }
    // let docContext = buildDocumentContext(viewportDiv);
    const viewportWidth = parseInt(layoutInfo.viewport.div.style.width, 10);

    const tableWidth = Math.floor(tableView.contentPct * viewportWidth);
    tableView.updateWidth(tableWidth);
    const tableIndent = Math.floor(tableView.indentPct * viewportWidth);
    let startRow: Table.Row;
    let startCell: ICellView;

    if (layoutInfo.startingPosStack) {
        if (layoutInfo.startingPosStack.row &&
            (layoutInfo.startingPosStack.row.items.length > layoutInfo.stackIndex)) {
            const startRowMarker = layoutInfo.startingPosStack.row.items[layoutInfo.stackIndex] as Table.IRowMarker;
            startRow = startRowMarker.row;
        }
        if (layoutInfo.startingPosStack.cell &&
            (layoutInfo.startingPosStack.cell.items.length > layoutInfo.stackIndex)) {
            const startCellMarker = layoutInfo.startingPosStack.cell.items[layoutInfo.stackIndex] as Table.ICellMarker;
            startCell = startCellMarker.cell as ICellView;
        }
    }

    let foundStartRow = (startRow === undefined);
    let tableHeight = 0;
    let deferredHeight = 0;
    let firstRendered = true;
    let prevRenderedRow: Table.Row;
    let prevCellCount;
    let topRow = (layoutInfo.startingPosStack !== undefined) && (layoutInfo.stackIndex === 0);
    for (let rowIndex = 0, rowCount = tableView.rows.length; rowIndex < rowCount; rowIndex++) {
        let cellCount = 0;
        const rowView = tableView.rows[rowIndex];
        let rowHeight = 0;
        if (startRow === rowView) {
            foundStartRow = true;
        }
        const renderRow = (!defer) && (deferredHeight >= layoutInfo.deferUntilHeight) &&
            foundStartRow && (!Table.rowIsMoribund(rowView.rowMarker));
        let rowDiv: IRowDiv;
        if (renderRow) {
            const y = layoutInfo.viewport.getLineTop();
            const rowRect = new ui.Rectangle(tableIndent, y, tableWidth, 0);
            rowDiv = document.createElement("div") as IRowDiv;
            rowDiv.rowView = rowView;
            rowRect.conformElementOpenHeight(rowDiv);
            if (topRow && startCell) {
                layoutCell(
                    startCell,
                    layoutInfo,
                    targetTranslation,
                    defer,
                    startCell === rowView.cells[0],
                    firstRendered);
                deferredHeight += startCell.renderOutput.deferredHeight;
                rowHeight = startCell.renderedHeight;
                cellCount++;
            }
        }
        let cellX = 0;
        for (let cellIndex = 0, cellsLen = rowView.cells.length; cellIndex < cellsLen; cellIndex++) {
            const cell = rowView.cells[cellIndex] as ICellView;
            if ((!topRow || (cell !== startCell)) && (!Table.cellIsMoribund(cell.marker))) {
                let noCellAbove = false;
                if (prevRenderedRow) {
                    if (prevCellCount <= cellIndex) {
                        noCellAbove = true;
                    }
                }
                layoutCell(cell, layoutInfo, targetTranslation, defer,
                    cell === rowView.cells[0],
                    firstRendered || noCellAbove);
                cellCount++;
                if (rowHeight < cell.renderedHeight) {
                    rowHeight = cell.renderedHeight;
                }
                deferredHeight += cell.renderOutput.deferredHeight;
                if (renderRow) {
                    cell.viewport.div.style.height = `${cell.renderedHeight}px`;
                    cell.div.style.height = `${cell.renderedHeight}px`;
                    cell.div.style.left = `${cellX}px`;
                    rowDiv.appendChild(cell.div);
                }
                cellX += (cell.specWidth - 1);
            }
        }
        firstRendered = false;
        if (renderRow) {
            const heightVal = `${rowHeight}px`;
            let adjustRowWidth = 0;
            for (let cellIndex = 0, cellsLen = rowView.cells.length; cellIndex < cellsLen; cellIndex++) {
                const cell = rowView.cells[cellIndex] as ICellView;
                if (cell.div) {
                    cell.div.style.height = heightVal;
                    cell.svgElm.setAttribute("height", heightVal);
                    cell.borderRect.setAttribute("height", heightVal);
                } else {
                    adjustRowWidth += tableView.logicalColumns[cellIndex].width;
                }
            }
            if (rowView.cells.length < tableView.logicalColumns.length) {
                for (let col = rowView.cells.length; col < tableView.logicalColumns.length; col++) {
                    adjustRowWidth += tableView.logicalColumns[col].width;
                }
            }
            let heightAdjust = 0;
            if (!firstRendered) {
                heightAdjust = 1;
            }
            tableHeight += (rowHeight - heightAdjust);
            layoutInfo.viewport.commitLineDiv(rowDiv, rowHeight - heightAdjust);
            rowDiv.style.height = heightVal;
            if (adjustRowWidth) {
                rowDiv.style.width = `${tableWidth - adjustRowWidth}px`;
            }
            rowDiv.linePos = rowView.pos;
            rowDiv.lineEnd = rowView.endPos;
            prevRenderedRow = rowView;
            prevCellCount = cellCount;
            layoutInfo.viewport.div.appendChild(rowDiv);
        }
        if (topRow) {
            topRow = false;
            layoutInfo.startingPosStack = undefined;
        }
    }
    if (layoutInfo.reRenderList) {
        for (const lineDiv of layoutInfo.reRenderList) {
            reRenderLine(lineDiv, flowView, docContext);
        }
        layoutInfo.reRenderList = undefined;
    }
    tableView.deferredHeight = deferredHeight;
    tableView.renderedHeight = tableHeight;
}

function showCell(pos: number, flowView: FlowView) {
    const client = flowView.client;
    const startingPosStack =
        flowView.client.mergeTree.getStackContext(pos, client.getClientId(), ["cell"]);
    if (startingPosStack.cell && (!startingPosStack.cell.empty())) {
        const cellMarker = startingPosStack.cell.top() as Table.ICellMarker;
        const start = getOffset(flowView, cellMarker);
        const endMarker = cellMarker.cell.endMarker;
        const end = getOffset(flowView, endMarker) + 1;
        // tslint:disable:max-line-length
        console.log(`cell ${cellMarker.getId()} seq ${cellMarker.seq} clid ${cellMarker.clientId} at [${start},${end})`);
        console.log(`cell contents: ${flowView.sharedString.getTextRangeWithMarkers(start, end)}`);
    }
}

function showTable(pos: number, flowView: FlowView) {
    const client = flowView.client;
    const startingPosStack =
        flowView.client.mergeTree.getStackContext(pos, client.getClientId(), ["table"]);
    if (startingPosStack.table && (!startingPosStack.table.empty())) {
        const tableMarker = startingPosStack.table.top() as Table.ITableMarker;
        const start = getOffset(flowView, tableMarker);
        const endMarker = tableMarker.table.endTableMarker;
        const end = getOffset(flowView, endMarker) + 1;
        console.log(`table ${tableMarker.getId()} at [${start},${end})`);
        console.log(`table contents: ${flowView.sharedString.getTextRangeWithMarkers(start, end)}`);
    }
}

function renderTree(
    viewportDiv: HTMLDivElement, requestedPosition: number, flowView: FlowView, targetTranslation: string) {
    const client = flowView.client;
    const docContext = buildDocumentContext(viewportDiv);
    flowView.lastDocContext = docContext;
    const outerViewportHeight = parseInt(viewportDiv.style.height, 10);
    const outerViewportWidth = parseInt(viewportDiv.style.width, 10);
    const outerViewport = new Viewport(outerViewportHeight, viewportDiv, outerViewportWidth);
    if (flowView.movingInclusion.onTheMove) {
        outerViewport.addInclusion(flowView, flowView.movingInclusion.marker,
            flowView.movingInclusion.exclu.x, flowView.movingInclusion.exclu.y,
            docContext.defaultLineDivHeight, true);
    }
    const startingPosStack =
        client.mergeTree.getStackContext(requestedPosition, client.getClientId(), ["table", "cell", "row"]);
    const layoutContext = {
        docContext,
        flowView,
        requestedPosition,
        viewport: outerViewport,
    } as ILayoutContext;
    if (startingPosStack.table && (!startingPosStack.table.empty())) {
        const outerTable = startingPosStack.table.items[0];
        const outerTablePos = flowView.client.mergeTree.getOffset(outerTable as MergeTree.Marker,
            MergeTree.UniversalSequenceNumber, flowView.client.getClientId());
        layoutContext.startPos = outerTablePos;
        layoutContext.stackIndex = 0;
        layoutContext.startingPosStack = startingPosStack;
    } else {
        const previousTileInfo = findTile(flowView, requestedPosition, "pg", true);
        if (previousTileInfo) {
            layoutContext.startPos = previousTileInfo.pos + 1;
        } else {
            layoutContext.startPos = 0;
        }
    }
    return renderFlow(layoutContext, targetTranslation);
}

function gatherOverlayLayer(
    segment: MergeTree.ISegment,
    segpos: number,
    refSeq: number,
    clientId: number,
    start: number,
    end: number,
    context: IOverlayMarker[]) {

    if (MergeTree.Marker.is(segment)) {
        if ((segment.refType === MergeTree.ReferenceType.Simple) &&
            (segment.hasSimpleType("inkOverlay"))) {
            context.push({ id: segment.getId(), position: segpos });
        }
    }

    return true;
}

// tslint:disable-next-line:no-empty-interface
export interface IViewportDiv extends HTMLDivElement {
}

function closestNorth(lineDivs: ILineDiv[], y: number) {
    let best = -1;
    let lo = 0;
    let hi = lineDivs.length - 1;
    while (lo <= hi) {
        let bestBounds: ClientRect;
        const mid = lo + Math.floor((hi - lo) / 2);
        const lineDiv = lineDivs[mid];
        const bounds = lineDiv.getBoundingClientRect();
        if (bounds.bottom <= y) {
            if (!bestBounds || (best < 0) || (bestBounds.bottom < bounds.bottom)) {
                best = mid;
                bestBounds = bounds;
            }
            lo = mid + 1;
        } else {
            hi = mid - 1;
        }
    }
    return best;
}

function closestSouth(lineDivs: ILineDiv[], y: number) {
    let best = -1;
    let lo = 0;
    let hi = lineDivs.length - 1;
    while (lo <= hi) {
        let bestBounds: ClientRect;
        const mid = lo + Math.floor((hi - lo) / 2);
        const lineDiv = lineDivs[mid];
        const bounds = lineDiv.getBoundingClientRect();
        if (bounds.bottom >= y) {
            if (!bestBounds || (best < 0) || (bestBounds.bottom > bounds.bottom)) {
                best = mid;
                bestBounds = bounds;
            }
            lo = mid + 1;
        } else {
            hi = mid - 1;
        }
    }
    return best;
}

export interface IExcludedRectangle extends ui.Rectangle {
    left: boolean;
    curY: number;
    id?: string;
    // What do the below parameters mean?
    requiresUL?: boolean;
    floatL?: boolean;
}

function makeExcludedRectangle(x: number, y: number, w: number, h: number, id?: string) {
    const r = <IExcludedRectangle>new ui.Rectangle(x, y, w, h);
    r.id = id;
    r.left = true;
    r.curY = 0;
    return r;
}

export interface ILineRect {
    e?: IExcludedRectangle;
    h: number;
    w: number;
    x: number;
    y: number;
}

function lineIntersectsRect(y: number, rect: IExcludedRectangle) {
    return (y >= rect.y) && (y <= (rect.y + rect.height));
}

export interface IFlowRefMarker extends MergeTree.Marker {
    flowView: FlowView;
}

export interface IListRefMarker extends MergeTree.Marker {
    selectionListBox: SearchMenu.ISelectionListBox;
}

export class Viewport {
    // keep the line divs in order
    public lineDivs: ILineDiv[] = [];
    public visibleRanges: IRange[] = [];
    public currentLineStart = -1;
    private lineTop = 0;
    private excludedRects = <IExcludedRectangle[]>[];
    private lineX = 0;
    private inclusions: Map<string, HTMLVideoElement> = new Map<string, HTMLVideoElement>();

    constructor(public maxHeight: number, public div: IViewportDiv, private width: number) {
    }

    public showExclu() {
        urlToInclusion(`${baseURI}/public/images/bennet1.jpeg`)
            .then((incl) => {
                for (const exclu of this.excludedRects) {
                    const showImage = document.createElement("img");
                    showImage.src = incl.url;
                    exclu.conformElement(showImage);
                    this.div.appendChild(showImage);
                }
            });
    }

    // Remove inclusions that are not in the excluded rect list
    public removeInclusions() {
        if (this.div) {
            // TODO: sabroner fix skip issue
            for (let i = 0; i < this.div.children.length; i++) {
                const child = this.div.children.item(i);
                if ((child.classList as DOMTokenList).contains("preserve")) {
                    if (this.excludedRects.every((e) => e.id !== child.classList[1])) {
                        this.div.removeChild(child);
                    }
                }
            }
        }
    }

    public viewHasInclusion(sha: string): HTMLDivElement {
        for (let i = 0; i < this.div.children.length; i++) {
            const child = this.div.children.item(i);
            if ((child.classList as DOMTokenList).contains(sha)) {
                return child as HTMLDivElement;
            }
        }

        return null;
    }

    public addInclusion(flowView: FlowView, marker: MergeTree.Marker, x: number, y: number,
        lineHeight: number, movingMarker = false) {
        if ((!flowView.movingInclusion.onTheMove) ||
            ((flowView.movingInclusion.onTheMove && (flowView.movingInclusion.marker !== marker)) ||
                movingMarker)) {
            const irdoc = <IReferenceDoc>marker.properties.ref;
            if (irdoc) {
                const borderSize = 4;
                // for now always an image
                const minX = Math.floor(this.width / 5);
                const w = Math.floor(this.width / 3);
                let h = w;
                // TODO: adjust dx, dy by viewport dimensions
                let dx = 0;
                let dy = 0;
                if (movingMarker) {
                    dx = flowView.movingInclusion.dx;
                    dy = flowView.movingInclusion.dy;
                }
                if (irdoc.layout) {
                    h = Math.floor(w * irdoc.layout.ar);
                }
                if ((x + w) > this.width) {
                    x -= w;
                }
                x = Math.floor(x + dx);
                if (x < minX) {
                    x = 0;
                }
                y += lineHeight;
                y = Math.floor(y + dy);
                const exclu = makeExcludedRectangle(x, y, w, h, irdoc.referenceDocId);
                // This logic eventually triggers the marker to get moved based on the requiresUL property
                if (movingMarker) {
                    exclu.requiresUL = true;
                    if (exclu.x === 0) {
                        exclu.floatL = true;
                    }
                }
                let excluDiv = <IRefDiv>this.viewHasInclusion(irdoc.referenceDocId);

                // Move the inclusion
                if (excluDiv) {
                    exclu.conformElement(excluDiv);
                    excluDiv.exclu = exclu;
                    excluDiv.marker = marker;

                    this.excludedRects = this.excludedRects.filter((e) => e.id !== exclu.id);
                    this.excludedRects.push(exclu);
                } else {
                    // Create inclusion for first time

                    excluDiv = <IRefDiv>document.createElement("div");
                    excluDiv.classList.add("preserve");
                    excluDiv.classList.add(irdoc.referenceDocId);
                    const innerDiv = document.createElement("div");
                    exclu.conformElement(excluDiv);
                    excluDiv.style.backgroundColor = "#DDDDDD";
                    const toHlt = (e: MouseEvent) => {
                        excluDiv.style.backgroundColor = "green";
                    };
                    const toOrig = (e: MouseEvent) => {
                        excluDiv.style.backgroundColor = "#DDDDDD";
                    };
                    excluDiv.onmouseleave = toOrig;
                    innerDiv.onmouseenter = toOrig;
                    excluDiv.onmouseenter = toHlt;
                    innerDiv.onmouseleave = toHlt;

                    const excluView = exclu.innerAbs(borderSize);
                    excluView.x = borderSize;
                    excluView.y = borderSize;
                    excluView.conformElement(innerDiv);
                    excluDiv.exclu = exclu;
                    excluDiv.marker = marker;
                    this.div.appendChild(excluDiv);
                    excluDiv.appendChild(innerDiv);

                    // Excluded Rects is checked when remaking paragraphs in getLineRect
                    this.excludedRects.push(exclu);
                    if (irdoc.type.name === "image") {
                        const showImage = document.createElement("img");
                        innerDiv.appendChild(showImage);
                        excluView.conformElement(showImage);
                        showImage.style.left = "0px";
                        showImage.style.top = "0px";
                        showImage.src = irdoc.url;
                    } else if (irdoc.type.name === "video") {
                        let showVideo: HTMLVideoElement;
                        if (irdoc.referenceDocId && this.inclusions.has(irdoc.referenceDocId)) {
                            showVideo = this.inclusions.get(irdoc.referenceDocId) as HTMLVideoElement;
                        } else {
                            showVideo = document.createElement("video");
                        }
                        innerDiv.appendChild(showVideo);
                        excluView.conformElement(showVideo);
                        showVideo.style.left = "0px";
                        showVideo.style.top = "0px";
                        showVideo.src = irdoc.url;
                        showVideo.controls = true;
                        showVideo.muted = true;
                        showVideo.load();
                        this.inclusions.set(irdoc.referenceDocId, showVideo);
                    } else if (irdoc.type.name === "list") {
                        const listRefMarker = marker as IListRefMarker;
                        let selectionIndex = 0;
                        const prevSelectionBox = listRefMarker.selectionListBox;
                        if (prevSelectionBox) {
                            selectionIndex = prevSelectionBox.getSelectionIndex();
                        }
                        const shapeRect = new ui.Rectangle(0, 0, exclu.width, exclu.height);
                        listRefMarker.selectionListBox =
                            SearchMenu.selectionListBoxCreate(shapeRect, false, innerDiv, 24, 2);

                        // Allow the list box to receive DOM focus and subscribe its 'keydown' handler.
                        allowDOMEvents(listRefMarker.selectionListBox.elm);
                        listRefMarker.selectionListBox.elm.addEventListener("keydown",
                            (e) => listRefMarker.selectionListBox.keydown(e));

                        const listIrdoc =
                            <IListReferenceDoc>listRefMarker.properties[Paragraph.referenceProperty];
                        for (const item of listIrdoc.items) {
                            item.div = undefined;
                        }
                        listRefMarker.selectionListBox.showSelectionList(listIrdoc.items);
                        listRefMarker.selectionListBox.setSelectionIndex(selectionIndex);
                    } else if ((irdoc.type.name === "childFlow") && (!flowView.parentFlow)) {
                        const flowRefMarker = marker as IFlowRefMarker;
                        let startChar = 0;
                        let cursorPos = 0;
                        const prevFlowView = flowRefMarker.flowView;
                        if (prevFlowView) {
                            startChar = prevFlowView.viewportStartPos;
                            cursorPos = prevFlowView.cursor.pos;
                        }
                        flowRefMarker.flowView = flowView.renderChildFlow(startChar, cursorPos,
                            innerDiv, exclu, marker);
                    }
                }
            }
        }
    }

    public horizIntersect(h: number, rect: IExcludedRectangle) {
        return lineIntersectsRect(this.lineTop, rect) || (lineIntersectsRect(this.lineTop + h, rect));
    }

    public firstLineDiv() {
        if (this.lineDivs.length > 0) {
            return this.lineDivs[0];
        }
    }

    public lastLineDiv() {
        if (this.lineDivs.length > 0) {
            return this.lineDivs[this.lineDivs.length - 1];
        }
    }

    public endOfParagraph(h: number) {
        if (this.lineX !== 0) {
            this.lineX = 0;
            this.lineTop += h;
        }
    }

    public getLineRect(h: number) {
        let x = this.lineX;
        let w = this.width;
        let rectHit = false;
        const y = this.lineTop;
        let e: IExcludedRectangle;
        for (const exclu of this.excludedRects) {
            if ((exclu.x >= x) && this.horizIntersect(h, exclu)) {
                if ((this.lineX === 0) && (exclu.x === 0)) {
                    x = exclu.x + exclu.width;
                    // TODO: assume for now only one rect across
                    this.lineX = 0;
                    w = this.width - x;
                } else {
                    this.lineX = exclu.x + exclu.width;
                    w = exclu.x - x;
                }
                if (exclu.requiresUL) {
                    e = exclu;
                    exclu.requiresUL = false;
                }
                rectHit = true;
                break;
            }
        }
        if (!rectHit) {
            // hit right edge
            w = this.width - x;
            this.lineX = 0;
        }

        return <ILineRect>{ e, h, w, x, y };
    }

    public currentLineWidth(h?: number) {
        return this.width;
    }

    public vskip(h: number) {
        this.lineTop += h;
    }

    public getLineX() {
        return this.lineX;
    }

    public getLineTop() {
        return this.lineTop;
    }

    public resetTop() {
        // TODO: update rect y to 0 and h to h-(deltaY-y)
        this.lineTop = 0;
        this.lineX = 0;
    }

    public setLineTop(v: number) {
        this.lineTop = v;
    }

    public commitLineDiv(lineDiv: ILineDiv, h: number, eol = true) {
        if (eol) {
            this.lineTop += h;
        }
        this.lineDivs.push(lineDiv);
    }

    public findClosestLineDiv(up = true, y: number) {
        let bestIndex = -1;
        if (up) {
            bestIndex = closestNorth(this.lineDivs, y);
        } else {
            bestIndex = closestSouth(this.lineDivs, y);
        }
        if (bestIndex >= 0) {
            return this.lineDivs[bestIndex];
        }
    }

    public remainingHeight() {
        return this.maxHeight - this.lineTop;
    }

    public setWidth(w: number) {
        this.width = w;
    }
}

interface ILayoutContext {
    containingPGMarker?: Paragraph.IParagraphMarker;
    viewport: Viewport;
    deferredAttach?: boolean;
    reRenderList?: ILineDiv[];
    deferUntilHeight?: number;
    docContext: IDocumentContext;
    requestedPosition?: number;
    startPos: number;
    endMarker?: MergeTree.Marker;
    flowView: FlowView;
    stackIndex?: number;
    startingPosStack?: MergeTree.RangeStackMap;
}

interface IRenderOutput {
    deferredHeight: number;
    overlayMarkers: IOverlayMarker[];
    // TODO: make this an array for tables that extend past bottom of viewport
    viewportStartPos: number;
    viewportEndPos: number;
}

export function getRenderedMathWidthHeight(hostDiv: HTMLDivElement, mathText: string, font: string) {
    const elt = document.createElement("div");
    hostDiv.appendChild(elt);
    elt.style.font = font;
    Katex.render(mathText, elt, { throwOnError: false });
    const bb = elt.getBoundingClientRect();
    hostDiv.removeChild(elt);
    return { h: bb.height, w: bb.width };
}

function makeFontInfo(docContext: IDocumentContext): Paragraph.IFontInfo {
    function gtw(text: string, fontstr: string) {
        return domutils.getTextWidth(text, fontstr);
    }

    function glh(fontstr: string, lineHeight?: string) {
        return domutils.getLineHeight(fontstr, lineHeight);
    }

    function getFont(pg: Paragraph.IParagraphMarker) {
        if (pg.properties["header"]) {
            return docContext.headerFontstr;
        } else {
            return docContext.fontstr;
        }
    }

    function getRMWH(mathText: string, font: string) {
        return getRenderedMathWidthHeight(docContext.viewportDiv, mathText, font);
    }
    return {
        getFont,
        getLineHeight: glh,
        getMathWidthHeight: getRMWH,
        getTextWidth: gtw,
    };
}

export interface IFlowBreakInfo extends Paragraph.IBreakInfo {
    lineY?: number;
    lineX?: number;
    lineWidth?: number;
    lineHeight?: number;
    movingExclu?: IExcludedRectangle;
}

export function breakPGIntoLinesFFVP(flowView: FlowView, itemInfo: Paragraph.IParagraphItemInfo, defaultLineHeight: number,
    viewport: Viewport, startOffset = 0) {
    const items = itemInfo.items;
    const savedTop = viewport.getLineTop();
    let lineRect = viewport.getLineRect(itemInfo.maxHeight);
    let breakInfo: IFlowBreakInfo = {
        lineHeight: defaultLineHeight,
        lineWidth: lineRect.w,
        lineX: lineRect.x, lineY: lineRect.y,
        movingExclu: lineRect.e,
        posInPG: 0, startItemIndex: 0,
    };
    const breaks = <IFlowBreakInfo[]>[breakInfo];
    let posInPG = 0;
    let committedItemsWidth = 0;
    let blockRunWidth = 0;
    let blockRunHeight = 0;
    let blockRunPos = -1;
    let prevIsGlue = true;
    let committedItemsHeight = 0;

    function checkViewportFirstLine(pos: number) {
        if (pos <= startOffset) {
            viewport.resetTop();
            return true;
        }
        return false;
    }

    for (let i = 0, len = items.length; i < len; i++) {
        const item = items[i];
        if (item.type === Paragraph.ParagraphItemType.Block) {
            item.pos = posInPG;
            if (prevIsGlue) {
                blockRunPos = posInPG;
                blockRunWidth = 0;
            }
            if ((committedItemsWidth + item.width) > lineRect.w) {
                if (viewport.getLineX() === 0) {
                    viewport.vskip(committedItemsHeight);
                }
                checkViewportFirstLine(blockRunPos);
                lineRect = viewport.getLineRect(itemInfo.maxHeight);
                breakInfo = {
                    lineHeight: committedItemsHeight,
                    lineWidth: lineRect.w,
                    lineX: lineRect.x, lineY: lineRect.y,
                    movingExclu: lineRect.e,
                    posInPG: blockRunPos, startItemIndex: i,
                };
                breaks.push(breakInfo);
                committedItemsWidth = blockRunWidth;
                committedItemsHeight = blockRunHeight;
            }
            posInPG += item.text.length;
            if (committedItemsWidth > lineRect.w) {
                if (viewport.getLineX() === 0) {
                    viewport.vskip(committedItemsHeight);
                }
                checkViewportFirstLine(posInPG);
                lineRect = viewport.getLineRect(itemInfo.maxHeight);
                breakInfo = {
                    lineHeight: committedItemsHeight,
                    lineWidth: lineRect.w,
                    lineX: lineRect.x, lineY: lineRect.y,
                    movingExclu: lineRect.e,
                    posInPG, startItemIndex: i,
                };
                breaks.push(breakInfo);
                committedItemsWidth = 0;
                committedItemsHeight = 0;
                blockRunHeight = 0;
                blockRunWidth = 0;
                blockRunPos = posInPG;
            } else {
                blockRunWidth += item.width;
                blockRunHeight = Math.max(blockRunHeight,
                    item.height ? item.height : defaultLineHeight);
            }
            prevIsGlue = false;
        } else if (item.type === Paragraph.ParagraphItemType.Glue) {
            posInPG++;
            prevIsGlue = true;
        } else if (item.type === Paragraph.ParagraphItemType.Marker) {
            viewport.addInclusion(flowView, <MergeTree.Marker>item.segment,
                lineRect.x + committedItemsWidth,
                viewport.getLineTop(), committedItemsHeight);
        }
        committedItemsWidth += item.width;
        if (item.type !== Paragraph.ParagraphItemType.Marker) {
            committedItemsHeight = Math.max(committedItemsHeight,
                item.height ? item.height : defaultLineHeight);
        }
    }
    viewport.endOfParagraph(itemInfo.maxHeight);
    viewport.setLineTop(savedTop);
    return breaks;
}

function renderFlow(layoutContext: ILayoutContext, targetTranslation: string, deferWhole = false): IRenderOutput {
    const flowView = layoutContext.flowView;
    const client = flowView.client;
    // TODO: for stable viewports cache the geometry and the divs
    // TODO: cache all this pre-amble in style blocks; override with pg properties
    const docContext = layoutContext.docContext;
    let viewportStartPos = -1;

    function makeLineDiv(r: ui.Rectangle, lineFontstr) {
        const lineDiv = makeContentDiv(r, lineFontstr);
        layoutContext.viewport.div.appendChild(lineDiv);
        return lineDiv;
    }

    let currentPos = layoutContext.startPos;
    let curPGMarker: Paragraph.IParagraphMarker;
    let curPGMarkerPos: number;

    // TODO: Should lift into a component-standard layout/render context instead
    //       of using 'services' to smuggle context to components.
    const itemsContext = {
        fontInfo: makeFontInfo(layoutContext.docContext),
        services: layoutContext.flowView.services,
    } as Paragraph.IItemsContext;
    if (layoutContext.deferUntilHeight === undefined) {
        layoutContext.deferUntilHeight = 0;
    }
    let deferredHeight = 0;
    const deferredPGs = (layoutContext.containingPGMarker !== undefined);
    const paragraphLexer = new Paragraph.ParagraphLexer({
        markerToken: Paragraph.markerToItems,
        mathToken: Paragraph.textToMathItem,
        textToken: Paragraph.textTokenToItems,
    }, itemsContext);
    itemsContext.paragraphLexer = paragraphLexer;
    textErrorRun = undefined;

    function makeAnnotDiv(x: number, y: number, width: number, fontstr: string) {
        const annotDiv = document.createElement("div");
        annotDiv.style.font = fontstr;
        annotDiv.style.fontStyle = "italic";
        const rect = new ui.Rectangle(x, y, width, 0);
        rect.conformElementOpenHeight(annotDiv);
        layoutContext.viewport.div.appendChild(annotDiv);
        return annotDiv;
    }

    function renderPGAnnotation(endPGMarker: Paragraph.IParagraphMarker, indentWidth: number, contentWidth: number) {
        const annotDiv = makeAnnotDiv(indentWidth, layoutContext.viewport.getLineTop(),
            contentWidth, docContext.fontstr);
        const text = endPGMarker.properties[targetTranslation];
        // tslint:disable-next-line:no-inner-html
        annotDiv.innerHTML = text;
        const clientRect = annotDiv.getBoundingClientRect();
        return clientRect.height;
    }

    function renderPG(
        endPGMarker: Paragraph.IParagraphMarker,
        pgStartPos: number,
        indentPct: number,
        indentSymbol: Paragraph.ISymbol,
        contentPct: number) {

        const pgBreaks = <IFlowBreakInfo[]>endPGMarker.cache.breaks;
        let lineDiv: ILineDiv;
        let lineDivHeight = docContext.defaultLineDivHeight;
        let span: ISegSpan;
        let lineWidth: number;
        let lineX = 0;
        let lineY: number;
        let lineFontstr = docContext.fontstr;
        lineDivHeight = docContext.defaultLineDivHeight;
        if (endPGMarker.properties && (endPGMarker.properties.header !== undefined)) {
            // TODO: header levels etc.
            lineDivHeight = docContext.headerDivHeight;
            lineFontstr = docContext.headerFontstr;
        }
        let lineHeight = lineDivHeight;
        for (let breakIndex = 0, len = pgBreaks.length; breakIndex < len; breakIndex++) {
            const breakInfo = pgBreaks[breakIndex];
            lineY = layoutContext.viewport.getLineTop();
            if (endPGMarker.cache.isUniformWidth) {
                lineWidth = layoutContext.viewport.currentLineWidth();
            } else {
                lineWidth = breakInfo.lineWidth;
                lineHeight = breakInfo.lineHeight;
                lineX = breakInfo.lineX;
                lineY = breakInfo.lineY;
            }
            let indentWidth = 0;
            let contentWidth = lineWidth;
            if (indentPct !== 0.0) {
                indentWidth = Math.floor(indentPct * lineWidth);
                if (docContext.indentWidthThreshold >= lineWidth) {
                    const em2 = Math.round(2 * domutils.getTextWidth("M", docContext.fontstr));
                    indentWidth = em2 + indentWidth;
                }
            }
            contentWidth = Math.floor(contentPct * lineWidth) - indentWidth;
            if (contentWidth > lineWidth) {
                // tslint:disable:max-line-length
                console.log(`egregious content width ${contentWidth} bound ${lineWidth}`);
            }

            const lineStart = breakInfo.posInPG + pgStartPos;
            let lineEnd: number;
            if (breakIndex < (len - 1)) {
                lineEnd = pgBreaks[breakIndex + 1].posInPG + pgStartPos;
            } else {
                lineEnd = undefined;
            }
            const lineOK = (!(deferredPGs || deferWhole)) && (layoutContext.deferUntilHeight <= deferredHeight);
            if (lineOK && ((lineEnd === undefined) || (lineEnd > layoutContext.requestedPosition))) {
                lineDiv = makeLineDiv(new ui.Rectangle(lineX, lineY, lineWidth, lineHeight), lineFontstr);
                lineDiv.endPGMarker = endPGMarker;
                lineDiv.breakIndex = breakIndex;
                let contentDiv = lineDiv;
                if (indentWidth > 0) {
                    contentDiv = makeContentDiv(new ui.Rectangle(indentWidth, 0, contentWidth, lineDivHeight),
                        lineFontstr);
                    lineDiv.indentWidth = indentWidth;
                    lineDiv.contentWidth = indentWidth;
                    if (indentSymbol && (breakIndex === 0)) {
                        lineDiv.indentSymbol = indentSymbol;
                        decorateLineDiv(lineDiv, lineFontstr, lineDivHeight);
                    }
                    lineDiv.appendChild(contentDiv);
                }
                const lineContext = {
                    contentDiv, deferredAttach: layoutContext.deferredAttach, flowView: layoutContext.flowView,
                    lineDiv, lineDivHeight, mathBuffer: "", mathMode: false, pgMarker: endPGMarker, span,
                } as ILineContext;
                if (viewportStartPos < 0) {
                    viewportStartPos = lineStart;
                }
                client.mergeTree.mapRange({ leaf: renderSegmentIntoLine }, MergeTree.UniversalSequenceNumber,
                    client.getClientId(), lineContext, lineStart, lineEnd);
                if (flowView.bookmarks) {
                    let computedEnd = lineEnd;
                    if (!computedEnd) {
                        computedEnd = client.mergeTree.getOffset(endPGMarker, client.getCurrentSeq(),
                            client.getClientId());
                    }
                    showBookmarks(layoutContext.flowView, lineStart,
                        computedEnd, lineFontstr, lineDivHeight, breakIndex, docContext, contentDiv, endPGMarker);
                }
                span = lineContext.span;
                if (lineContext.reRenderList) {
                    if (!layoutContext.reRenderList) {
                        layoutContext.reRenderList = [];
                    }
                    for (const ldiv of lineContext.reRenderList) {
                        layoutContext.reRenderList.push(ldiv);
                    }
                }
                let eol = (lineX + lineWidth) >= layoutContext.viewport.currentLineWidth();
                eol = eol || (lineEnd === undefined);
                layoutContext.viewport.commitLineDiv(lineDiv, lineDivHeight, eol);
                if (breakInfo.movingExclu) {
                    // console.log(`exclu line ${lineDiv.innerHTML} pos ${lineDiv.linePos} end ${lineDiv.lineEnd}`);
                    if (breakInfo.movingExclu.floatL) {
                        flowView.movingInclusion.ulPos = lineDiv.linePos;
                    } else {
                        flowView.movingInclusion.ulPos = lineDiv.lineEnd;
                        if (lineDiv.lineEnd === curPGMarkerPos) {
                            flowView.movingInclusion.ulPos--;
                        }
                    }
                }
            } else {
                deferredHeight += lineDivHeight;
            }

            if (layoutContext.viewport.remainingHeight() < docContext.defaultLineDivHeight) {
                // no more room for lines
                break;
            }
        }
        return lineDiv.lineEnd;
    }

    const fetchLog = false;
    let segoff: ISegmentOffset;
    const totalLength = client.getLength();
    let viewportEndPos = currentPos;
    // TODO: use end of doc marker
    do {
        if (!segoff) {
            segoff = getContainingSegment(flowView, currentPos);
        }
        if (fetchLog) {
            console.log(`got segment ${segoff.segment.toString()}`);
        }
        if (!segoff.segment) {
            break;
        }

        const asMarker = MergeTree.Marker.is(segoff.segment)
            ? segoff.segment
            : undefined;

        const maybeComponent = asMarker && ui.maybeGetComponent(asMarker);

        const newBlock = getComponentBlock(asMarker);
        if (newBlock) {
            const refDoc = newBlock.properties.crefTest as IReferenceDoc;
            let ch: number;
            if (refDoc.type.name === "math") {
                if (!newBlock.instance) {
                    // for now, use math; later need to load route async
                    layoutContext.flowView.loadMath(newBlock as IMathViewMarker);
                }
                const layout = newBlock.instance.query("IComponentLayout") as IComponentLayout;
                if (layout) {
                    if (layout.heightInLines) {
                        ch = layout.heightInLines() * docContext.defaultLineDivHeight;
                    }
                } else {
                    ch = Math.round(0.2 * layoutContext.viewport.maxHeight);
                }
                const lineDiv = makeLineDiv(
                    new ui.Rectangle(
                        0,
                        layoutContext.viewport.getLineTop(),
                        parseInt(layoutContext.viewport.div.style.width, 10),
                        ch),
                    layoutContext.docContext.fontstr);

                newBlock.instance.render(lineDiv, ComponentDisplayType.Block);
            } else {
                if (newBlock.instance) {
                    const layout = newBlock.instance.query("IComponentLayout") as IComponentLayout;

                    // TODO pinpoint layout only makes sense if the desired width/height is given since the title,
                    // description, etc... text will flow based on the given width
                    ch = layout && layout.heightInLines
                        ? layout.heightInLines() * docContext.defaultLineDivHeight
                        : 520;

                    const lineDiv = makeLineDiv(
                        new ui.Rectangle(
                            0,
                            layoutContext.viewport.getLineTop(),
                            parseInt(layoutContext.viewport.div.style.width, 10),
                            ch),
                        layoutContext.docContext.fontstr);

                    newBlock.instance.render(lineDiv, ComponentDisplayType.Block);
                } else {
                    // Delay load the instance if not available
                    if (!newBlock.instanceP) {
                        newBlock.instanceP = layoutContext.flowView.collabDocument.context.hostRuntime
                            .request({ url: `/${newBlock.properties.leafId}` })
                            .then(async (response) => {
                                if (response.status !== 200 || response.mimeType !== "prague/component") {
                                    return Promise.reject(response);
                                }

                                const component = response.value as IComponent;
                                // TODO below is a temporary workaround. Should every QI interface also implement
                                // IComponent. Then you can go from IComponentRenderHTML to IComponentLayout.
                                // Or should you query for each one individually.
                                const viewable = component.query<any>("IComponentRenderHTML") as IRenderComponent;
                                if (!viewable) {
                                    return Promise.reject("component is not viewable");
                                }

                                return viewable;
                            });

                        newBlock.instanceP.then((instance) => {
                            newBlock.instance = instance;
                            const compPos = getOffset(layoutContext.flowView, asMarker);
                            layoutContext.flowView.localQueueRender(compPos);
                        });
                    }

                    ch = 10;
                    const lineDiv = makeLineDiv(
                        new ui.Rectangle(
                            0,
                            layoutContext.viewport.getLineTop(),
                            parseInt(layoutContext.viewport.div.style.width, 10),
                            ch),
                        layoutContext.docContext.fontstr);
                    lineDiv.style.backgroundColor = "red";
                }
            }

            layoutContext.viewport.vskip(ch);
            currentPos++;
            segoff = undefined;
        } else if (isBlock(maybeComponent)) {
            const context = new ui.FlowViewContext(
                document.createElement("canvas").getContext("2d"),
                layoutContext.viewport.div.style,
                layoutContext.flowView.services,
            );

            const componentDiv = maybeComponent.upsert(
                asMarker.properties.state,
                context,
                asMarker.properties.cachedElement,
            );

            if (componentDiv !== asMarker.properties.cachedElement) {
                asMarker.properties.cachedElement = componentDiv;
                allowDOMEvents(componentDiv);
            }

            // Force subtree positioning to be relative to the lineDiv we create below.
            componentDiv.style.display = "flex";

            // Temporarily parent 'componentDiv' in the position where we will insert the lineDiv
            // in order to calculate it's height.
            layoutContext.viewport.div.appendChild(componentDiv);
            const componentHeight = componentDiv.scrollHeight;
            componentDiv.remove();

            const lineDiv = makeLineDiv(
                new ui.Rectangle(
                    0,
                    layoutContext.viewport.getLineTop(),
                    parseInt(layoutContext.viewport.div.style.width, 10),
                    componentHeight),
                layoutContext.docContext.fontstr);

            lineDiv.appendChild(componentDiv);

            // TODO: Suspect that missing ILineDiv metadata on element is why scroll(..) can hang on components.
            // componentDiv.linePos = currentPos;
            // componentDiv.lineEnd = currentPos + 1;
            layoutContext.viewport.vskip(componentHeight);
            currentPos++;
            segoff = undefined;
        } else if (asMarker && asMarker.hasRangeLabel("table")) {
            // TODO: branches
            let tableView: Table.Table;
            if (asMarker.removedSeq === undefined) {
                renderTable(asMarker, docContext, layoutContext, targetTranslation, deferredPGs);
                tableView = (asMarker as Table.ITableMarker).table;
                deferredHeight += tableView.deferredHeight;
                layoutContext.viewport.vskip(layoutContext.docContext.tableVspace);
            } else {
                tableView = Table.parseTable(asMarker, currentPos, flowView.sharedString,
                    makeFontInfo(layoutContext.docContext));
            }
            const endTablePos = getOffset(layoutContext.flowView, tableView.endTableMarker);
            currentPos = endTablePos + 1;
            segoff = undefined;
            // TODO: if reached end of viewport, get pos ranges
        } else {
            if (asMarker) {
                // empty paragraph
                curPGMarker = segoff.segment as Paragraph.IParagraphMarker;
                if (fetchLog) {
                    console.log("empty pg");
                    if (curPGMarker.itemCache) {
                        console.log(`length items ${curPGMarker.itemCache.items.length}`);
                    }
                }
                curPGMarkerPos = currentPos;
            } else {
                const curTilePos = findTile(flowView, currentPos, "pg", false);
                curPGMarker = curTilePos.tile as Paragraph.IParagraphMarker;
                curPGMarkerPos = curTilePos.pos;
            }
            itemsContext.curPGMarker = curPGMarker;
            // TODO: only set this to undefined if text changed
            curPGMarker.listCache = undefined;
            Paragraph.getListCacheInfo(layoutContext.flowView.sharedString, curPGMarker, curPGMarkerPos);
            let indentSymbol: Paragraph.ISymbol;
            const indentPct = Paragraph.getIndentPct(curPGMarker);
            const contentPct = Paragraph.getContentPct(curPGMarker);

            if (curPGMarker.listCache) {
                indentSymbol = Paragraph.getIndentSymbol(curPGMarker);
            }
            if (flowView.historyClient) {
                Paragraph.clearContentCaches(curPGMarker);
            }
            if (!curPGMarker.itemCache) {
                itemsContext.itemInfo = { items: [], minWidth: 0 };
                client.mergeTree.mapRange({ leaf: Paragraph.segmentToItems }, MergeTree.UniversalSequenceNumber,
                    client.getClientId(), itemsContext, currentPos, curPGMarkerPos + 1);
                curPGMarker.itemCache = itemsContext.itemInfo;
            } else {
                itemsContext.itemInfo = curPGMarker.itemCache;
            }
            // TODO: always use break VP for excluded regions; go ahead and break each time
            // TODO: this is particular to pg annotation; need to call different vp idea for
            //   annotation
            const contentWidth = layoutContext.viewport.currentLineWidth();
            // const breaks = Paragraph.breakPGIntoLinesFF(itemsContext.itemInfo.items, contentWidth);
            // curPGMarker.cache = { breaks, isUniformWidth: true, uniformLineWidth: contentWidth };

            let startOffset = 0;
            if (layoutContext.requestedPosition > currentPos) {
                startOffset = layoutContext.requestedPosition - currentPos;
            }
            const breaks = breakPGIntoLinesFFVP(layoutContext.flowView, itemsContext.itemInfo, docContext.defaultLineDivHeight,
                layoutContext.viewport, startOffset);
            curPGMarker.cache = { breaks, isUniformWidth: false };
            paragraphLexer.reset();
            // TODO: more accurate end of document reasoning

            if (currentPos < totalLength) {
                const lineEnd = renderPG(curPGMarker, currentPos, indentPct, indentSymbol, contentPct);
                viewportEndPos = lineEnd;
                currentPos = curPGMarkerPos + curPGMarker.cachedLength;

                if (!deferredPGs) {
                    if (curPGMarker.properties[targetTranslation]) {
                        // layoutContext.viewport.vskip(Math.floor(docContext.pgVspace/2));
                        // TODO: make sure content width is same as pg width (may be different with regions present)
                        const height = renderPGAnnotation(curPGMarker, Math.floor(indentPct * contentWidth),
                            Math.floor(contentPct * contentWidth));
                        layoutContext.viewport.vskip(height);
                    }
                }
                if (currentPos < totalLength) {
                    segoff = getContainingSegment(flowView, currentPos);
                    if (MergeTree.Marker.is(segoff.segment)) {
                        if (segoff.segment.hasRangeLabel("cell") && (segoff.segment.refType & MergeTree.ReferenceType.NestEnd)) {
                            break;
                        }
                    }
                } else {
                    break;
                }
                if (!deferredPGs) {
                    layoutContext.viewport.vskip(docContext.pgVspace);
                }
            } else {
                break;
            }
        }
    } while (layoutContext.viewport.remainingHeight() >= docContext.defaultLineDivHeight);

    // Find overlay annotations

    const overlayMarkers: IOverlayMarker[] = [];
    client.mergeTree.mapRange(
        { leaf: gatherOverlayLayer },
        MergeTree.UniversalSequenceNumber,
        client.getClientId(),
        overlayMarkers,
        viewportStartPos,
        viewportEndPos);

    layoutContext.viewport.removeInclusions();

    return {
        deferredHeight,
        overlayMarkers,
        viewportEndPos,
        viewportStartPos,
    };
}

function makeMathSpan(mathSegpos: number, offsetFromSegpos: number) {
    const span = document.createElement("span") as ISegSpan;
    span.segPos = mathSegpos;
    if (offsetFromSegpos > 0) {
        span.offset = offsetFromSegpos;
    }
    return span;
}

function makeSegSpan(
    context: FlowView, segText: string, textSegment: MergeTree.TextSegment, offsetFromSegpos: number,
    segpos: number) {
    const span = document.createElement("span") as ISegSpan;
    span.innerText = segText;
    span.seg = textSegment;
    span.segPos = segpos;
    let textErr = false;
    const spellOption = "spellchecker";
    if (textSegment.properties) {
        // tslint:disable-next-line
        for (let key in textSegment.properties) {
            if (key === "textError" && (viewOptions === undefined || viewOptions[spellOption] !== "disabled")) {
                textErr = true;
                if (textErrorRun === undefined) {
                    textErrorRun = {
                        end: segpos + offsetFromSegpos + segText.length,
                        start: segpos + offsetFromSegpos,
                    };
                } else {
                    textErrorRun.end += segText.length;
                }
                const textErrorInfo = textSegment.properties[key] as ITextErrorInfo;
                let slb: SearchMenu.ISelectionListBox;
                span.textErrorRun = textErrorRun;
                if (textErrorInfo.color === "paul") {
                    span.style.background = underlinePaulStringURL;
                } else if (textErrorInfo.color === "paulgreen") {
                    span.style.background = underlinePaulGrammarStringURL;
                } else if (textErrorInfo.color === "paulgolden") {
                    span.style.background = underlinePaulGoldStringURL;
                } else {
                    span.style.background = underlineStringURL;
                }
                if (textErrorInfo.alternates.length > 0) {
                    span.onmousedown = (e) => {
                        function cancelIntellisense(ev: MouseEvent) {
                            if (slb) {
                                document.body.removeChild(slb.elm);
                                slb = undefined;
                            }
                        }
                        function acceptIntellisense(ev: MouseEvent) {
                            cancelIntellisense(ev);
                            const itemElm = ev.target as HTMLElement;
                            const text = itemElm.innerText.trim();
                            context.sharedString.removeText(span.textErrorRun.start, span.textErrorRun.end);
                            context.sharedString.insertText(text, span.textErrorRun.start);
                            context.localQueueRender(span.textErrorRun.start);
                        }
                        function selectItem(ev: MouseEvent) {
                            const itemElm = ev.target as HTMLElement;
                            if (slb) {
                                slb.selectItem(itemElm.innerText);
                            }
                            // console.log(`highlight ${itemElm.innerText}`);
                        }
                        console.log(`button ${e.button}`);
                        if ((e.button === 2) || ((e.button === 0) && (e.ctrlKey))) {
                            const spanBounds = ui.Rectangle.fromClientRect(span.getBoundingClientRect());
                            spanBounds.width = Math.floor(window.innerWidth / 4);
                            slb = SearchMenu.selectionListBoxCreate(spanBounds, true, document.body, 24, 0, 12);
                            slb.showSelectionList(altsToItems(textErrorInfo.alternates));
                            span.onmouseup = cancelIntellisense;
                            document.body.onmouseup = cancelIntellisense;
                            slb.elm.onmouseup = acceptIntellisense;
                            slb.elm.onmousemove = selectItem;
                        } else if (e.button === 0) {
                            context.clickSpan(e.clientX, e.clientY, span);
                        }
                    };
                }
            } else if (key === "blink") {
                if (textSegment.properties[key]) {
                    span.classList.add("blinking");
                }
            } else {
                span.style[key] = textSegment.properties[key];
            }
        }
    }
    if (!textErr) {
        textErrorRun = undefined;
    }
    if (offsetFromSegpos > 0) {
        span.offset = offsetFromSegpos;
    }
    return span;
}

function pointerToElementOffsetWebkit(x: number, y: number): IRangeInfo {
    const range = document.caretRangeFromPoint(x, y);
    if (range) {
        const result = {
            elm: range.startContainer.parentElement as HTMLElement,
            node: range.startContainer,
            offset: range.startOffset,
        };
        range.detach();
        return result;
    }
}

export function pixelToPosition(flowView: FlowView, x: number, y: number) {
    const elm = document.elementFromPoint(x, y);
    if (elm.tagName === "SPAN") {
        let position: number;
        const span = elm as ISegSpan;
        const elmOff = pointerToElementOffsetWebkit(x, y);
        if (elmOff) {
            let computed = elmOffToSegOff(elmOff, span);
            if (span.offset) {
                computed += span.offset;
            }
            position = span.segPos + computed;
        }
        return position;
    } else {
        let targetLineDiv = elm as ILineDiv;
        if (targetLineDiv.linePos !== undefined) {
            return flowView.getPosFromPixels(targetLineDiv, x);
        }
        do {
            targetLineDiv = targetLineDiv.previousElementSibling as ILineDiv;
        } while (targetLineDiv && (targetLineDiv.linePos === undefined));
        if (targetLineDiv) {
            return flowView.getPosFromPixels(targetLineDiv, x);
        }
    }
}

export function clearInclusion(elm: HTMLElement, sha: string) {
    for (const child of elm.childNodes) {
        if ((child as HTMLElement).classList.contains(sha)) {
            return elm.removeChild(child);
        }
    }
}

const Nope = -1;

const presenceColors = ["darkgreen", "sienna", "olive", "purple"];
export class FlowCursor extends Cursor {
    public presenceDiv: HTMLDivElement;
    public presenceInfo: ILocalPresenceInfo;
    public presenceInfoUpdated = true;

    constructor(public viewportDiv: HTMLDivElement, public pos = 0) {
        super(viewportDiv, pos);
    }

    public hide(hidePresenceDiv: boolean = false) {
        this.editSpan.style.visibility = "hidden";

        if (hidePresenceDiv && this.presenceInfo) {
            this.presenceDiv.style.visibility = "hidden";
        }
    }

    public show() {
        if (!this.enabled) {
            return;
        }

        this.editSpan.style.backgroundColor = this.bgColor;
        this.editSpan.style.visibility = "visible";

        if (this.presenceInfo) {
            this.presenceDiv.style.visibility = "visible";
        }
    }

    /**
     * Refreshes the cursor
     * It will enable / disable the cursor depending on if the client is connected
     */
    public refresh() {
        if (this.presenceInfo) {
            if (this.presenceInfo.shouldShowCursor()) {
                this.enable();
            } else {
                this.disable();
            }
        }
    }
    public addPresenceInfo(presenceInfo: ILocalPresenceInfo) {
        // for now, color
        const presenceColorIndex = presenceInfo.clientId % presenceColors.length;
        this.bgColor = presenceColors[presenceColorIndex];
        this.presenceInfo = presenceInfo;
        this.makePresenceDiv();

        this.refresh();

        if (this.enabled) {
            this.show();
        } else {
            this.hide(true);
        }
    }

    public setPresenceDivEvents(div: HTMLDivElement) {
        this.presenceDiv.onmouseenter = (e) => {
            div.innerText = (this.presenceInfo.user as IFlowViewUser).name;
        };
        this.presenceDiv.onmouseleave = (e) => {
            div.innerText = this.getUserDisplayString(this.presenceInfo.user as IFlowViewUser);
        };
    }

    public makePresenceDiv() {
        this.presenceDiv = document.createElement("div");
        // TODO callback to go from UID to display information
        this.presenceDiv.innerText = this.getUserDisplayString(this.presenceInfo.user as IFlowViewUser);
        this.presenceDiv.style.zIndex = "1";
        this.presenceDiv.style.position = "absolute";
        this.presenceDiv.style.color = "white";
        this.presenceDiv.style.backgroundColor = this.bgColor;
        this.presenceDiv.style.font = "10px Arial";
        this.presenceDiv.style.border = `2px solid ${this.bgColor}`;
        this.presenceDiv.style.borderTopRightRadius = "1em";
        this.setPresenceDivEvents(this.presenceDiv);
        // go underneath local cursor
        this.editSpan.style.zIndex = "1";
    }

    public onLine(pos: number) {
        const lineDiv = this.lineDiv();
        return lineDiv && (pos >= lineDiv.linePos) && (pos < lineDiv.lineEnd);
    }

    public lineDiv() {
        return this.editSpan.parentElement as ILineDiv;
    }

    public updateView(flowView: FlowView) {
        if (flowView.modes.showCursorLocation) {
            flowView.cursorLocation();
        }
        if (this.getSelection()) {
            flowView.render(flowView.topChar, true);
        } else {
            const lineDiv = this.lineDiv();
            if (lineDiv && (lineDiv.linePos <= this.pos) && (lineDiv.lineEnd > this.pos)) {
                reRenderLine(lineDiv, flowView, flowView.lastDocContext);
            } else {
                const foundLineDiv = findLineDiv(this.pos, flowView, true);
                if (foundLineDiv) {
                    reRenderLine(foundLineDiv, flowView, flowView.lastDocContext);
                } else {
                    flowView.render(flowView.topChar, true);
                }
            }
        }
    }

    public assignToLine(x: number, h: number, lineDiv: HTMLDivElement, show = true) {
        this.editSpan.style.left = `${x}px`;
        this.editSpan.style.height = `${h}px`;
        if (this.editSpan.parentElement) {
            this.editSpan.parentElement.removeChild(this.editSpan);
        }
        lineDiv.appendChild(this.editSpan);
        if (this.presenceInfo) {
            const bannerHeight = 16;
            const halfBannerHeight = bannerHeight / 2;
            this.presenceDiv.style.left = `${x}px`;
            this.presenceDiv.style.height = `${bannerHeight}px`;
            this.presenceDiv.style.top = `-${halfBannerHeight}px`;
            if (this.presenceDiv.parentElement) {
                this.presenceDiv.parentElement.removeChild(this.presenceDiv);
            }
            lineDiv.appendChild(this.presenceDiv);
            this.setPresenceDivEvents(this.presenceDiv);
        }
        if ((!this.presenceInfo) || (this.presenceInfo.fresh)) {
            if (this.presenceInfo) {
                this.editSpan.style.opacity = "0.6";
                this.presenceDiv.style.opacity = "0.6";
            }
            if (show) {
                this.show();
                this.blinkCursor();
            } else {
                this.hide();
            }
        }
    }

    protected blinkCursor() {
        if (this.presenceDiv) {
            // this.editSpan.classList.add("brieflyBlinking");
            // this.presenceDiv.classList.add("brieflyBlinking");
        } else {
            super.blinkCursor();
        }
    }

    private getUserDisplayString(user: IFlowViewUser): string {
        // TODO - callback to client code to provide mapping from user -> display
        // this would allow a user ID to be put on the wire which can then be mapped
        // back to an email, name, etc...
        const name = user.name;
        const nameParts = name.split(" ");
        let initials = "";
        for (const part of nameParts) {
            initials += part.substring(0, 1);
        }
        return initials;
    }
}

export interface IRemotePresenceBase {
    type: string;
}
export interface ILocalPresenceInfo {
    localRef?: MergeTree.LocalReference;
    markLocalRef?: MergeTree.LocalReference;
    xformPos?: number;
    markXformPos?: number;
    clientId: number;
    user: IUser;
    cursor?: FlowCursor;
    fresh: boolean;
    shouldShowCursor: () => boolean;
}

export interface IRemotePresenceInfo extends IRemotePresenceBase {
    type: "selection";
    origPos: number;
    origMark: number;
    refseq: number;
}

export interface IMovingInclusionInfo {
    onTheMove: boolean;
    exclu?: IExcludedRectangle;
    marker?: MergeTree.Marker;
    dx?: number;
    dy?: number;
    ulPos?: number;
}

export interface IRemoteDragInfo extends IRemotePresenceBase {
    type: "drag";
    exclu: IExcludedRectangle;
    markerPos: number;
    onTheMove: boolean;
    dx: number;
    dy: number;
}

interface ISegmentOffset {
    segment: MergeTree.ISegment;
    offset: number;
}

interface IWordRange {
    wordStart: number;
    wordEnd: number;
}

function getCurrentWord(pos: number, mergeTree: MergeTree.MergeTree) {
    let wordStart = -1;
    let wordEnd = -1;

    function maximalWord(textSegment: MergeTree.TextSegment, offset: number) {
        let segWordStart = offset;
        let segWordEnd = offset;

        let epos = offset;
        const nonWord = /\W/;
        while (epos < textSegment.text.length) {
            if (nonWord.test(textSegment.text.charAt(epos))) {
                break;
            }
            epos++;
        }
        segWordEnd = epos;
        if (segWordEnd > offset) {
            let spos = offset - 1;
            while (spos >= 0) {
                if (nonWord.test(textSegment.text.charAt(spos))) {
                    break;
                }
                spos--;
            }
            segWordStart = spos + 1;
        }
        return { wordStart: segWordStart, wordEnd: segWordEnd } as IWordRange;
    }

    const expandWordBackward = (segment: MergeTree.ISegment) => {
        if (mergeTree.localNetLength(segment)) {
            if (MergeTree.TextSegment.is(segment)) {
                const innerOffset = segment.text.length - 1;
                const maxWord = maximalWord(segment, innerOffset);
                if (maxWord.wordStart < maxWord.wordEnd) {
                    wordStart -= (maxWord.wordEnd - maxWord.wordStart);
                    return (maxWord.wordStart === 0);
                } else {
                    return false;
                }
            }
            return false;
        }
        return true;
    };

    const expandWordForward = (segment: MergeTree.ISegment) => {
        if (mergeTree.localNetLength(segment)) {
            if (MergeTree.TextSegment.is(segment)) {
                const innerOffset = 0;
                const maxWord = maximalWord(segment, innerOffset);
                if (maxWord.wordEnd > innerOffset) {
                    wordEnd += (maxWord.wordEnd - innerOffset);
                }
                return (maxWord.wordEnd === segment.text.length);
            }
            return false;
        }
        return true;
    };

    const segoff = mergeTree.getContainingSegment(pos,
        MergeTree.UniversalSequenceNumber, mergeTree.collabWindow.clientId);
    if (segoff.segment && (MergeTree.TextSegment.is(segoff.segment))) {
        const maxWord = maximalWord(segoff.segment, segoff.offset);
        if (maxWord.wordStart < maxWord.wordEnd) {
            const segStartPos = pos - segoff.offset;
            wordStart = segStartPos + maxWord.wordStart;
            wordEnd = segStartPos + maxWord.wordEnd;
            if (maxWord.wordStart === 0) {
                mergeTree.leftExcursion(segoff.segment, expandWordBackward);
            }
            if (maxWord.wordEnd === segoff.segment.text.length) {
                mergeTree.rightExcursion(segoff.segment, expandWordForward);
            }
        }
        if (wordStart >= 0) {
            return { wordStart, wordEnd } as IWordRange;
        }
    }
}

function getLocalRefPos(flowView: FlowView, localRef: MergeTree.LocalReference) {
    return flowView.client.mergeTree.getOffset(localRef.segment, MergeTree.UniversalSequenceNumber,
        flowView.client.getClientId()) + localRef.offset;
}

function getContainingSegment(flowView: FlowView, pos: number): ISegmentOffset {
    return flowView.client.mergeTree.getContainingSegment(pos, MergeTree.UniversalSequenceNumber,
        flowView.client.getClientId());
}

function findTile(flowView: FlowView, startPos: number, tileType: string, preceding: boolean) {
    return flowView.sharedString.findTile(startPos, tileType, preceding);
}

export function annotateMarker(flowView: FlowView, props: MergeTree.PropertySet, marker: MergeTree.Marker) {
    const start = getOffset(flowView, marker);
    const end = start + marker.cachedLength;
    flowView.sharedString.annotateRange(props, start, end);
}

function getOffset(flowView: FlowView, segment: MergeTree.ISegment) {
    return flowView.client.mergeTree.getOffset(segment, MergeTree.UniversalSequenceNumber,
        flowView.client.getClientId());
}

function preventD(e: Event) {
    e.returnValue = false;
    e.preventDefault();
    return false;
}

export interface IReferenceDocType {
    name: string;
}

export interface IRefLayoutSpec {
    inline?: boolean;
    minWidth?: number;
    minHeight?: number;
    reqWidth?: number;
    reqHeight?: number;
    heightPct?: number;
    heightLines?: number;
    ar?: number;
    dx?: number;
    dy?: number;
}

export interface IReferenceDoc {
    type: IReferenceDocType;
    referenceDocId?: string;
    url: string;
    layout?: IRefLayoutSpec;
}

export interface IListReferenceDoc extends IReferenceDoc {
    items: SearchMenu.ISearchMenuCommand[];
    selectionIndex: number;
}

export function makeBlobRef(blob: IGenericBlob, cb: (irdoc: IReferenceDoc) => void) {
    switch (blob.type) {
        case "image": {
            const image = document.createElement("img");
            const irdocType = <IReferenceDocType>{
                name: "image",
            };
            const irdoc = <IReferenceDoc>{
                referenceDocId: blob.id,
                type: irdocType,
                url: blob.url,
            };
            image.src = blob.url;

            image.onload = () => {
                irdoc.layout = { ar: image.naturalHeight / image.naturalWidth, dx: 0, dy: 0 };
                cb(irdoc);
            };
            break;
        }
        case "video": {
            const video = document.createElement("video");
            const irdocType = <IReferenceDocType>{
                name: "video",
            };
            const irdoc = <IReferenceDoc>{
                referenceDocId: blob.id,
                type: irdocType,
                url: blob.url,
            };
            video.src = blob.url;
            cb(irdoc);
            video.load();
        }
    }
}

export interface IFlowViewModes {
    showBookmarks?: boolean;
    showComments?: boolean;
    showCursorLocation?: boolean;
}

export interface ISeqTestItem {
    x: string;
    v: number;
}

export class FlowView extends ui.Component implements SearchMenu.ISearchMenuHost {
    public static docStartPosition = 0;
    public timeToImpression: number;
    public timeToLoad: number;
    public timeToEdit: number;
    public timeToCollab: number;
    public prevTopSegment: MergeTree.TextSegment;
    public viewportStartPos: number;
    public viewportEndPos: number;
    public cursorSpan: HTMLSpanElement;
    public componentCursor: IComponentCursor;
    public viewportDiv: HTMLDivElement;
    public viewportRect: ui.Rectangle;
    public client: MergeTree.Client;
    public historyClient: MergeTree.Client;
    public historyWidget: HTMLDivElement;
    public historyBubble: HTMLDivElement;
    public historyVersion: HTMLSpanElement;
    public savedClient: MergeTree.Client;
    public ticking = false;
    public wheelTicking = false;
    public topChar = -1;
    public cursor: FlowCursor;
    public bookmarks: Sequence.SharedIntervalCollectionView<Sequence.SharedStringInterval>;
    public tempBookmarks: Sequence.SharedStringInterval[];
    public comments: Sequence.SharedIntervalCollection<Sequence.SharedStringInterval>;
    public commentsView: Sequence.SharedIntervalCollectionView<Sequence.SharedStringInterval>;
    public calendarIntervals: Sequence.SharedIntervalCollection<Sequence.Interval>;
    public calendarIntervalsView: Sequence.SharedIntervalCollectionView<Sequence.Interval>;
    public sequenceTest: Sequence.SharedNumberSequence;
    public sequenceObjTest: Sequence.SharedObjectSequence<ISeqTestItem>;
    public presenceSignal: PresenceSignal;
    public presenceVector: ILocalPresenceInfo[] = [];
    public docRoot: types.ISharedMap;
    public curPG: MergeTree.Marker;
    public modes = {
        randExclusion: false,
        showBookmarks: true,
        showComments: true,
        showCursorLocation: true,
    } as IFlowViewModes;
    public movingInclusion = <IMovingInclusionInfo>{ onTheMove: false };
    public lastDocContext: IDocumentContext;
    public focusChild: FlowView;
    public focusMarker: MergeTree.Marker;
    public childMarker: MergeTree.Marker;
    public parentFlow: FlowView;
    public keypressHandler: (e: KeyboardEvent) => void;
    public keydownHandler: (e: KeyboardEvent) => void;

    // TODO: 'services' is being used temporarily to smuggle context down to components.
    //       Should be replaced w/component-standardized render context, layout context, etc.
    public services = new Map<string, any>();
    public srcLanguage = "en";

    private lastVerticalX = -1;
    private randWordTimer: any;
    private pendingRender = false;
    private diagCharPort = false;
    private targetTranslation: string;
    private activeSearchBox: SearchMenu.ISearchBox;
    private cmdTree: MergeTree.TST<IFlowViewCmd>;
    private formatRegister: MergeTree.PropertySet;

    private progressBars: ProgressCollection;
    private math: IMathCollection;
    private videoPlayers: IComponentCollection;

    // A list of Marker segments modified by the most recently processed op.  (Reset on each
    // sequenceDelta event.)  Used by 'updatePgInfo()' to determine if table information
    // may have been invalidated.
    private modifiedMarkers = [];

    private readonly undoRedoManager = new UndoRedoStackManager();

    constructor(
        element: HTMLDivElement,
        public collabDocument: api.Document,
        public sharedString: Sequence.SharedString,
        public status: Status,
        public options?: Object) {

        super(element);

        // Enable element to receive focus (see Example 1):
        // https://www.w3.org/WAI/GL/WCAG20/WD-WCAG20-TECHS/SCR29.html
        this.element.tabIndex = 0;

        // Disable visible focus outline when FlowView is focused.
        this.element.style.outline = "0px solid transparent";

        // Clip children of FlowView to the bounds of the FlowView's root div.
        this.element.style.overflow = "hidden";

        this.cmdTree = new MergeTree.TST<IFlowViewCmd>();
        for (const command of commands) {
            this.cmdTree.put(command.key.toLowerCase(), command);
        }

        this.client = sharedString.client;

        this.viewportDiv = document.createElement("div");
        this.element.appendChild(this.viewportDiv);
        const translationToLanguage = "translationToLanguage";
        this.targetTranslation = options[translationToLanguage]
            ? `translation-${options[translationToLanguage]}`
            : undefined;
        if (options["translationFromLanguage"]) {
            this.srcLanguage = options["translationFromLanguage"];
        }
        this.statusMessage("li", " ");
        this.statusMessage("si", " ");

        this.undoRedoManager.attachSequence(sharedString);

        sharedString.on("sequenceDelta", (event, target) => {
            // For each incoming delta, save any referenced Marker segments.
            // (see comments at 'modifiedMarkers' decl for more info.)
            this.modifiedMarkers = event
                .ranges
                .filter((range) => MergeTree.Marker.is(range.segment));

            this.handleSharedStringDelta(event, target);
        });

        // refresh cursors when clients join or leave
        collabDocument.runtime.getQuorum().on("addMember", () => {
            this.updatePresenceCursors();
            this.broadcastPresence();
        });
        collabDocument.runtime.getQuorum().on("removeMember", () => {
            this.updatePresenceCursors();
        });

        this.openCollections();

        this.cursor = new FlowCursor(this.viewportDiv);
        this.setViewOption(this.options);
        blobUploadHandler(
            element,
            this.collabDocument,
            (incl: IGenericBlob) => this.insertBlobInternal(incl),
        );

        // HACK: Expose "insertComponent" and "insertText" via window to Shared Browser Extension
        //       for 2018/Oct demo.
        window["insertComponent"] = this.insertComponent.bind(this);
        window["insertText"] = (text: string) => {
            this.sharedString.insertText(text, this.cursor.pos);
        };

        // Expose the ability to invalidate the current layout when a component's width/height changes.
        this.services.set("invalidateLayout", () => {
            console.log("Component invalidated layout");
            this.localQueueRender(FlowView.docStartPosition);
        });

        // Provide access to the containing shared object
        this.services.set("document", this.collabDocument);
        this.initializeMaps();
    }

    public async initializeMaps() {
        // TODO: Should insert a workbook into the document on demand, implement the ability
        //       to add references to pre-existing notebooks, support multiple notebooks, ...
        //
        //       Instead, we currently check to see if a workbook already exists.  If not, we
        //       insert one up front.
        const rootMap = this.collabDocument.getRoot();
        let workbookMap: types.ISharedMap;

        if (!this.collabDocument.existing) {
            workbookMap = this.collabDocument.createMap();
        } else {
            workbookMap = await rootMap.wait<types.ISharedMap>("workbook");
        }

        this.services.set(
            "workbook",
            new SharedWorkbook(workbookMap, 6, 6, [
                ["Player", "Euchre", "Bridge", "Poker", "Go Fish", "Total Wins"],
                ["Daniel", "0", "0", "0", "5", "=SUM(B2:E2)"],
                ["Kurt", "2", "3", "0", "0", "=SUM(B3:E3)"],
                ["Sam", "3", "4", "0", "0", "=SUM(B4:E4)"],
                ["Tanvir", "3", "3", "0", "0", "=SUM(B5:E5)"],
                ["Total Played", "=SUM(B2:B5)", "=SUM(C2:C5)", "=SUM(D2:D5)", "=SUM(E2:E5)", "=SUM(F2:F5)"],
            ]));

        // Set the map after loading data so it's populated when other clients load it
        if (!this.collabDocument.existing) {
            rootMap.set("workbook", workbookMap);
        }

        workbookMap.on("valueChanged", () => {
            // TODO: Track which cells are visible and damp invalidation for off-screen cells.
            this.queueRender(undefined, true);
        });
    }

    public treeForViewport() {
        console.log(this.sharedString.client.mergeTree.rangeToString(this.viewportStartPos, this.viewportEndPos));
    }

    public renderChildFlow(startChar: number, cursorPos: number, flowElement: HTMLDivElement,
        flowRect: IExcludedRectangle, marker: MergeTree.Marker) {
        const childFlow = new FlowView(flowElement, this.collabDocument, this.sharedString,
            this.status, this.options);
        childFlow.parentFlow = this;
        childFlow.setEdit(this.docRoot);
        childFlow.comments = this.comments;
        childFlow.commentsView = this.commentsView;
        childFlow.presenceSignal = this.presenceSignal;
        childFlow.presenceVector = this.presenceVector;
        childFlow.bookmarks = this.bookmarks;
        childFlow.cursor.pos = cursorPos;
        const clientRect = new ui.Rectangle(0, 0, flowRect.width, flowRect.height);
        childFlow.resizeCore(clientRect);
        childFlow.render(startChar, true);
        if (this.focusMarker === marker) {
            this.focusChild = childFlow;
        }
        childFlow.childMarker = marker;
        return childFlow;
    }

    public addChildFlow() {
        const rdocType = <IReferenceDocType>{
            name: "childFlow",
        };
        const irdoc = <IReferenceDoc>{
            referenceDocId: "C",
            type: rdocType,
        };
        const refProps = {
            [Paragraph.referenceProperty]: irdoc,
        };
        this.sharedString.insertMarker(this.cursor.pos, MergeTree.ReferenceType.Simple, refProps);
    }

    public measureClone() {
        const clock = Date.now();
        this.client.cloneFromSegments();
        console.log(`clone took ${Date.now() - clock}ms`);
    }

    /* tslint:disable:insecure-random */
    public createBookmarks(k: number) {
        const len = this.sharedString.client.getLength();
        for (let i = 0; i < k; i++) {
            const pos1 = Math.floor(Math.random() * (len - 1));
            const intervalLen = Math.max(1, Math.floor(Math.random() * Math.min(len - pos1, 150)));
            const props = { clid: this.sharedString.client.longClientId };
            this.bookmarks.add(pos1, pos1 + intervalLen, MergeTree.IntervalType.Simple,
                props);
        }
        this.localQueueRender(-1);
    }

    public updatePresenceCursors() {
        for (const presenceInfo of this.presenceVector) {
            if (presenceInfo && presenceInfo.cursor) {
                presenceInfo.cursor.refresh();
            }
        }
    }

    public xUpdateHistoryBubble(x: number) {
        const widgetDivBounds = this.historyWidget.getBoundingClientRect();
        const w = widgetDivBounds.width - 14;
        let diffX = x - (widgetDivBounds.left + 7);
        if (diffX <= 0) {
            diffX = 0;
        }
        const pct = diffX / w;
        const l = 7 + Math.floor(pct * w);
        const seq = this.client.historyToPct(pct);
        this.historyVersion.innerText = `Version @${seq}`;
        this.historyBubble.style.left = `${l}px`;
        this.cursor.pos = FlowView.docStartPosition;
        this.localQueueRender(FlowView.docStartPosition);
    }

    public updateHistoryBubble(seq: number) {
        const widgetDivBounds = this.historyWidget.getBoundingClientRect();
        const w = widgetDivBounds.width - 14;
        const count = this.client.undoSegments.length + this.client.redoSegments.length;
        const pct = this.client.undoSegments.length / count;
        const l = 7 + Math.floor(pct * w);
        this.historyBubble.style.left = `${l}px`;
        this.historyVersion.innerText = `Version @${seq}`;
    }

    public makeHistoryWidget() {
        const bounds = ui.Rectangle.fromClientRect(this.status.element.getBoundingClientRect());
        const x = Math.floor(bounds.width / 2);
        const y = 2;
        const widgetRect = new ui.Rectangle(x, y, Math.floor(bounds.width * 0.4),
            (bounds.height - 4));
        const widgetDiv = document.createElement("div");
        widgetRect.conformElement(widgetDiv);
        widgetDiv.style.zIndex = "3";
        const bubble = document.createElement("div");
        widgetDiv.style.borderRadius = "6px";
        bubble.style.position = "absolute";
        bubble.style.width = "8px";
        bubble.style.height = `${bounds.height - 6}px`;
        bubble.style.borderRadius = "5px";
        bubble.style.top = "1px";
        bubble.style.left = `${widgetRect.width - 7}px`;
        bubble.style.backgroundColor = "pink";
        widgetDiv.style.backgroundColor = "rgba(179,179,179,0.3)";
        widgetDiv.appendChild(bubble);
        const versionSpan = document.createElement("span");
        widgetDiv.appendChild(versionSpan);
        versionSpan.innerText = "History";
        versionSpan.style.padding = "3px";
        this.historyVersion = versionSpan;
        this.historyWidget = widgetDiv;
        this.historyBubble = bubble;
        const clickHistory = (ev: MouseEvent) => {
            this.xUpdateHistoryBubble(ev.clientX);
        };
        const mouseDownBubble = (ev: MouseEvent) => {
            widgetDiv.onmousemove = clickHistory;
        };
        const cancelHistory = (ev: MouseEvent) => {
            widgetDiv.onmousemove = preventD;
        };
        bubble.onmousedown = mouseDownBubble;
        widgetDiv.onmouseup = cancelHistory;
        widgetDiv.onmousemove = preventD;
        bubble.onmouseup = cancelHistory;
        this.status.addSlider(this.historyWidget);
    }
    public goHistorical() {
        if (!this.historyClient) {
            this.historyClient = this.client.cloneFromSegments();
            this.savedClient = this.client;
            this.client = this.historyClient;
            this.makeHistoryWidget();
        }
    }

    public backToTheFuture() {
        if (this.historyClient) {
            this.client = this.savedClient;
            this.historyClient = undefined;
            this.status.removeSlider();
            this.topChar = 0;
            this.localQueueRender(0);
        }
    }

    public historyBack() {
        this.goHistorical();
        if (this.client.undoSegments.length > 0) {
            const seq = this.client.undo();
            this.updateHistoryBubble(seq);
            this.cursor.pos = FlowView.docStartPosition;
            this.localQueueRender(FlowView.docStartPosition);
        }
    }

    public historyForward() {
        this.goHistorical();
        if (this.client.redoSegments.length > 0) {
            const seq = this.client.redo();
            this.updateHistoryBubble(seq);
            this.cursor.pos = FlowView.docStartPosition;
            this.localQueueRender(FlowView.docStartPosition);
        }
    }

    // assumes docRoot ready
    public addCalendarMap() {
        this.calendarIntervals =
            this.docRoot.get<Sequence.SharedIntervalCollection<Sequence.Interval>>("calendar");
        if (this.calendarIntervals) {
            this.calendarIntervals.getView().then((v) => {
                this.calendarIntervalsView = v;
            });
        }
    }

    public addSeqObjEntry() {
        const len = this.sequenceObjTest.getItemCount();
        const pos = Math.floor(Math.random() * len);
        const item = <ISeqTestItem>{ x: "veal", v: Math.floor(Math.random() * 10) };
        this.sequenceObjTest.insert(pos, [item]);
    }

    public addSequenceEntry() {
        const len = this.sequenceTest.getItemCount();
        const pos = Math.floor(Math.random() * len);
        const item = Math.floor(Math.random() * 10);
        this.sequenceTest.insert(pos, [item]);
    }

    public showSequenceEntries() {
        const items = this.sequenceTest.getItems(0);
        this.statusMessage("seq", `seq: ${items.toString()}`);
    }

    public addCalendarEntries() {
        this.calendarIntervalsView.add(0, 10, MergeTree.IntervalType.Simple, { text: "picnic" });
    }

    public showCalendarEntries() {
        const intervals = this.calendarIntervalsView.findOverlappingIntervals(5, 6);
        if (intervals && (intervals.length > 0)) {
            this.statusMessage("cal", intervals[0].properties["text"]);
        }
    }

    public addPresenceSignal(presenceSignal: PresenceSignal) {
        presenceSignal.on("message", (message: IInboundSignalMessage, local: boolean) => {
            this.remotePresenceUpdate(message, local);
        });

        this.broadcastPresence();
    }

    public presenceInfoInRange(start: number, end: number) {
        for (let i = 0, len = this.presenceVector.length; i < len; i++) {
            const presenceInfo = this.presenceVector[i];
            if (presenceInfo) {
                if ((start <= presenceInfo.xformPos) && (presenceInfo.xformPos <= end)) {
                    return presenceInfo;
                }
            }
        }
    }

    public updatePresencePosition(localPresenceInfo: ILocalPresenceInfo) {
        if (localPresenceInfo) {
            localPresenceInfo.xformPos = getLocalRefPos(this, localPresenceInfo.localRef);
            if (localPresenceInfo.markLocalRef) {
                localPresenceInfo.markXformPos = getLocalRefPos(this, localPresenceInfo.markLocalRef);
            } else {
                localPresenceInfo.markXformPos = localPresenceInfo.xformPos;
            }
        }
    }

    public updatePresencePositions() {
        for (let i = 0, len = this.presenceVector.length; i < len; i++) {
            this.updatePresencePosition(this.presenceVector[i]);
        }
    }

    public updatePresenceVector(localPresenceInfo: ILocalPresenceInfo) {
        this.updatePresencePosition(localPresenceInfo);
        const presentPresence = this.presenceVector[localPresenceInfo.clientId];
        let tempXformPos = -1;
        let tempMarkXformPos = -2;

        if (presentPresence) {
            if (presentPresence.cursor) {
                localPresenceInfo.cursor = presentPresence.cursor;
                localPresenceInfo.cursor.presenceInfo = localPresenceInfo;
                localPresenceInfo.cursor.presenceInfoUpdated = true;
            }
            if (presentPresence.markLocalRef) {
                const markBaseSegment = presentPresence.localRef.segment as MergeTree.BaseSegment;
                this.client.mergeTree.removeLocalReference(markBaseSegment, presentPresence.markLocalRef);
            }
            const baseSegment = presentPresence.localRef.segment as MergeTree.BaseSegment;
            this.client.mergeTree.removeLocalReference(baseSegment, presentPresence.localRef);
            tempXformPos = presentPresence.xformPos;
            tempMarkXformPos = presentPresence.markXformPos;
        }
        this.client.mergeTree.addLocalReference(localPresenceInfo.localRef);
        if (localPresenceInfo.markLocalRef) {
            this.client.mergeTree.addLocalReference(localPresenceInfo.localRef);
        }
        this.presenceVector[localPresenceInfo.clientId] = localPresenceInfo;
        if ((localPresenceInfo.xformPos !== tempXformPos) ||
            (localPresenceInfo.markXformPos !== tempMarkXformPos)) {
            const sameLine = localPresenceInfo.cursor &&
                localPresenceInfo.cursor.onLine(tempXformPos) &&
                localPresenceInfo.cursor.onLine(tempMarkXformPos) &&
                localPresenceInfo.cursor.onLine(localPresenceInfo.xformPos) &&
                localPresenceInfo.cursor.onLine(localPresenceInfo.markXformPos);
            this.presenceQueueRender(localPresenceInfo, sameLine);
        }
    }

    public statusMessage(key: string, msg: string) {
        this.status.add(key, msg);
    }

    public firstLineDiv() {
        return this.lineDivSelect((elm) => (elm), this.viewportDiv, false);
    }

    public lastLineDiv() {
        return this.lineDivSelect((elm) => (elm), this.viewportDiv, false, true);
    }

    /**
     * Returns the (x, y) coordinate of the given position relative to the FlowView's coordinate system or null
     * if the position is not visible.
     */
    public getPositionLocation(position: number): ui.IPoint {
        const lineDiv = findLineDiv(position, this, true);
        if (!lineDiv) {
            return null;
        }

        // Estimate placement location
        const text = this.sharedString.getText(lineDiv.linePos, position);
        const textWidth = domutils.getTextWidth(text, lineDiv.style.font);
        const lineDivRect = lineDiv.getBoundingClientRect();

        const location = { x: lineDivRect.left + textWidth, y: lineDivRect.bottom };

        return location;
    }

    /**
     * Retrieves the nearest sequence position relative to the given viewport location
     */
    public getNearestPosition(location: ui.IPoint): number {
        const lineDivs: ILineDiv[] = [];
        this.lineDivSelect(
            (lineDiv) => {
                lineDivs.push(lineDiv);
                return null;
            },
            this.viewportDiv,
            false);

        // Search for the nearest line divs to the element
        const closestUp = closestNorth(lineDivs, location.y);
        const closestDown = closestSouth(lineDivs, location.y);

        // And then the nearest location within them
        let distance = Number.MAX_VALUE;
        let position: number;

        if (closestUp !== -1) {
            const upPosition = this.getPosFromPixels(lineDivs[closestUp], location.x);
            const upLocation = this.getPositionLocation(upPosition);
            distance = ui.distanceSquared(location, upLocation);
            position = upPosition;
        }

        if (closestDown !== -1) {
            const downPosition = this.getPosFromPixels(lineDivs[closestDown], location.x);
            const downLocation = this.getPositionLocation(downPosition);
            const downDistance = ui.distanceSquared(location, downLocation);

            if (downDistance < distance) {
                distance = downDistance;
                position = downPosition;
            }
        }

        return position;
    }

    public checkRow(lineDiv: ILineDiv, fn: (lineDiv: ILineDiv) => ILineDiv, rev?: boolean) {
        let rowDiv = lineDiv as IRowDiv;
        let oldRowDiv: IRowDiv;
        while (rowDiv && (rowDiv !== oldRowDiv) && rowDiv.rowView) {
            oldRowDiv = rowDiv;
            lineDiv = undefined;
            for (const cell of rowDiv.rowView.cells) {
                if (cell.div) {
                    const innerDiv = this.lineDivSelect(fn, (cell as ICellView).viewport.div, true, rev);
                    if (innerDiv) {
                        lineDiv = innerDiv;
                        rowDiv = innerDiv as IRowDiv;
                        break;
                    }
                }
            }
        }
        return lineDiv;
    }

    public lineDivSelect(fn: (lineDiv: ILineDiv) => ILineDiv, viewportDiv: IViewportDiv, dive = false, rev?: boolean) {
        if (rev) {
            let elm = viewportDiv.lastElementChild as ILineDiv;
            while (elm) {
                if (elm.linePos !== undefined) {
                    let lineDiv = fn(elm);
                    if (lineDiv) {
                        if (dive) {
                            lineDiv = this.checkRow(lineDiv, fn, rev);
                        }
                        return lineDiv;
                    }
                }
                elm = elm.previousElementSibling as ILineDiv;
            }

        } else {
            let elm = viewportDiv.firstElementChild as ILineDiv;
            while (elm) {
                if (elm.linePos !== undefined) {
                    let lineDiv = fn(elm);
                    if (lineDiv) {
                        if (dive) {
                            lineDiv = this.checkRow(lineDiv, fn, rev);
                        }
                        return lineDiv;
                    }
                } else {
                    console.log(`elm in fwd line search is ${elm.tagName}`);
                }
                elm = elm.nextElementSibling as ILineDiv;
            }
        }
    }

    public clickSpan(x: number, y: number, elm: HTMLSpanElement) {
        const span = elm as ISegSpan;
        const elmOff = pointerToElementOffsetWebkit(x, y);
        if (elmOff) {
            let computed = elmOffToSegOff(elmOff, span);
            if (span.offset) {
                computed += span.offset;
            }
            this.cursor.pos = span.segPos + computed;
            this.cursor.enable();
            if (this.componentCursor) {
                this.componentCursor.leave(ComponentCursorDirection.Airlift);
                this.componentCursor = undefined;
            }
            const tilePos = findTile(this, this.cursor.pos, "pg", false);
            if (tilePos) {
                this.curPG = tilePos.tile as MergeTree.Marker;
            }
            this.broadcastPresence();
            this.cursor.updateView(this);
            if (this.parentFlow) {
                this.parentFlow.focusChild = this;
                this.parentFlow.focusMarker = this.childMarker;
            }
            this.focusChild = undefined;
            this.focusMarker = undefined;
            return true;
        }
    }

    public getSegSpan(span: ISegSpan): ISegSpan {
        while (span.tagName === "SPAN") {
            if (span.segPos) {
                return span;
            } else {
                span = span.parentElement as ISegSpan;
            }
        }
    }

    public getPosFromPixels(targetLineDiv: ILineDiv, x: number) {
        let position: number;

        if (targetLineDiv && (targetLineDiv.linePos !== undefined)) {
            let y: number;
            const targetLineBounds = targetLineDiv.getBoundingClientRect();
            y = targetLineBounds.top + Math.floor(targetLineBounds.height / 2);
            const elm = document.elementFromPoint(x, y);
            if (elm.tagName === "DIV") {
                if ((targetLineDiv.lineEnd - targetLineDiv.linePos) === 1) {
                    // empty line
                    position = targetLineDiv.linePos;
                } else if (targetLineDiv === elm) {
                    if (targetLineDiv.indentWidth !== undefined) {
                        const relX = x - targetLineBounds.left;
                        if (relX <= targetLineDiv.indentWidth) {
                            position = targetLineDiv.linePos;
                        } else {
                            position = targetLineDiv.lineEnd;
                        }
                    } else {
                        position = targetLineDiv.lineEnd;
                    }
                } else {
                    // content div
                    if (x <= targetLineBounds.left) {
                        position = targetLineDiv.linePos;
                    } else {
                        position = targetLineDiv.lineEnd;
                    }
                }

            } else if (elm.tagName === "SPAN") {
                const span = this.getSegSpan(elm as ISegSpan);
                if (span) {
                    const elmOff = pointerToElementOffsetWebkit(x, y);
                    if (elmOff) {
                        let computed = elmOffToSegOff(elmOff, span);
                        if (span.offset) {
                            computed += span.offset;
                        }
                        position = span.segPos + computed;
                        if (position === targetLineDiv.lineEnd) {
                            position--;
                        }
                    }
                } else {
                    position = 0;
                }
            }
        }

        return position;
    }

    // TODO: handle symbol div
    public setCursorPosFromPixels(targetLineDiv: ILineDiv, x: number) {
        const position = this.getPosFromPixels(targetLineDiv, x);
        if (position !== undefined) {
            this.cursor.enable();
            if (this.componentCursor) {
                this.componentCursor.leave(ComponentCursorDirection.Airlift);
                this.componentCursor = undefined;
            }
            this.cursor.pos = position;
            return true;
        } else {
            return false;
        }
    }

    public getCanonicalX() {
        let rect = this.cursor.rect();
        const mathTileInfo = this.inMathGetMarker();
        if (mathTileInfo) {
            const mathEndMarker = mathTileInfo.tile as IMathEndMarker;
            rect = mathEndMarker.outerSpan.getBoundingClientRect();
        }
        let x: number;
        if (this.lastVerticalX >= 0) {
            x = this.lastVerticalX;
        } else {
            x = Math.floor(rect.left);
            this.lastVerticalX = x;
        }
        return x;
    }

    public cursorRev(skipFirstRev = false) {
        if (this.cursor.pos > FlowView.docStartPosition) {
            if (!skipFirstRev) {
                this.cursor.pos--;
            }
            const segoff = getContainingSegment(this, this.cursor.pos);
            if (MergeTree.Marker.is(segoff.segment)) {
                const marker = segoff.segment as MergeTree.Marker;
                if (marker.refType & MergeTree.ReferenceType.Tile) {
                    if (marker.hasTileLabel("pg")) {
                        if (marker.hasRangeLabel("table") && (marker.refType & MergeTree.ReferenceType.NestEnd)) {
                            this.cursorRev();
                        }
                    } else if (marker.hasTileLabel("math")) {
                        return;
                    }
                } else if ((marker.refType === MergeTree.ReferenceType.NestEnd) && (marker.hasRangeLabel("cell"))) {
                    const cellMarker = marker as Table.ICellMarker;
                    const endId = cellMarker.getId();
                    let beginMarker: Table.ICellMarker;
                    if (endId) {
                        const id = Table.idFromEndId(endId);
                        beginMarker = this.sharedString.client.mergeTree.getSegmentFromId(id) as Table.ICellMarker;
                    }
                    if (beginMarker && Table.cellIsMoribund(beginMarker)) {
                        this.tryMoveCell(this.cursor.pos, true);
                    } else {
                        this.cursorRev();
                    }
                } else if (isMathComponentView(marker)) {
                    const mathMarker = marker as IMathViewMarker;
                    this.loadMath(mathMarker);
                    this.cursor.disable();
                    this.componentCursor = mathMarker.instance;
                    mathMarker.instance.enter(ComponentCursorDirection.Right);
                } else {
                    this.cursorRev();
                }
            }
        }
    }

    public cursorFwd() {
        if (this.cursor.pos < (this.client.getLength() - 1)) {
            this.cursor.pos++;

            const segoff = this.client.mergeTree.getContainingSegment(this.cursor.pos, MergeTree.UniversalSequenceNumber,
                this.client.getClientId());
            if (MergeTree.Marker.is(segoff.segment)) {
                // REVIEW: assume marker for now
                const marker = segoff.segment as MergeTree.Marker;
                if (marker.refType & MergeTree.ReferenceType.Tile) {
                    if (marker.hasTileLabel("pg")) {
                        if (marker.hasRangeLabel("table") && (marker.refType & MergeTree.ReferenceType.NestEnd)) {
                            this.cursorFwd();
                        } else {
                            return;
                        }
                    } else if (marker.hasTileLabel("math")) {
                        this.cursor.pos++;
                    }
                } else if (marker.refType & MergeTree.ReferenceType.NestBegin) {
                    if (marker.hasRangeLabel("table")) {
                        this.cursor.pos += 3;
                    } else if (marker.hasRangeLabel("row")) {
                        this.cursor.pos += 2;
                    } else if (marker.hasRangeLabel("cell")) {
                        if (Table.cellIsMoribund(marker)) {
                            this.tryMoveCell(this.cursor.pos);
                        } else {
                            this.cursor.pos += 1;
                        }
                    } else {
                        this.cursorFwd();
                    }
                } else if (marker.refType & MergeTree.ReferenceType.NestEnd) {
                    if (marker.hasRangeLabel("row")) {
                        this.cursorFwd();
                    } else if (marker.hasRangeLabel("table")) {
                        this.cursor.pos += 2;
                    } else {
                        this.cursorFwd();
                    }
                } else if (isMathComponentView(marker)) {
                    const mathMarker = marker as IMathViewMarker;
                    this.loadMath(mathMarker);
                    this.cursor.disable();
                    this.componentCursor = mathMarker.instance;
                    mathMarker.instance.enter(ComponentCursorDirection.Left);
                } else {
                    this.cursorFwd();
                }
            }
        }
    }

    public verticalMove(lineCount: number) {
        const up = lineCount < 0;
        const lineDiv = this.cursor.lineDiv();
        let targetLineDiv = lineDiv;
        if (lineCount < 0) {
            do {
                targetLineDiv = targetLineDiv.previousElementSibling as ILineDiv;
            } while (targetLineDiv && (targetLineDiv.linePos === undefined));
        } else {
            do {
                targetLineDiv = targetLineDiv.nextElementSibling as ILineDiv;
            } while (targetLineDiv && (targetLineDiv.linePos === undefined));
        }
        const x = this.getCanonicalX();

        // if line div is row, then find line in box closest to x
        function checkInTable() {
            let rowDiv = targetLineDiv as IRowDiv;
            while (rowDiv && rowDiv.rowView) {
                if (rowDiv.rowView) {
                    const cell = rowDiv.rowView.findClosestCell(x) as ICellView;
                    if (cell) {
                        if (up) {
                            targetLineDiv = cell.viewport.lastLineDiv();
                        } else {
                            targetLineDiv = cell.viewport.firstLineDiv();
                        }
                        rowDiv = targetLineDiv as IRowDiv;
                    } else {
                        break;
                    }
                }
            }
        }

        if (targetLineDiv) {
            checkInTable();
            return this.setCursorPosFromPixels(targetLineDiv, x);
        } else {
            // TODO: handle nested tables
            // go out to row containing this line (line may be at top or bottom of box)
            const rowDiv = findRowParent(lineDiv);
            if (rowDiv && rowDiv.rowView) {
                const rowView = rowDiv.rowView;
                const tableView = rowView.table;
                let targetRow: Table.Row;
                if (up) {
                    targetRow = tableView.findPrecedingRow(rowView);
                } else {
                    targetRow = tableView.findNextRow(rowView);
                }
                if (targetRow) {
                    const cell = targetRow.findClosestCell(x) as ICellView;
                    if (cell) {
                        if (up) {
                            targetLineDiv = cell.viewport.lastLineDiv();
                        } else {
                            targetLineDiv = cell.viewport.firstLineDiv();
                        }
                    }
                    return this.setCursorPosFromPixels(targetLineDiv, x);
                } else {
                    // top or bottom row of table
                    if (up) {
                        targetLineDiv = rowDiv.previousElementSibling as ILineDiv;
                    } else {
                        targetLineDiv = rowDiv.nextElementSibling as ILineDiv;
                    }
                    if (targetLineDiv) {
                        checkInTable();
                        return this.setCursorPosFromPixels(targetLineDiv, x);
                    }
                }
            }
        }
    }

    public viewportCharCount() {
        return this.viewportEndPos - this.viewportStartPos;
    }

    public clearSelection(render = true) {
        // TODO: only rerender line if selection on one line
        if (this.cursor.getSelection()) {
            this.cursor.clearSelection();
            this.broadcastPresence();
            if (render) {
                this.localQueueRender(this.cursor.pos);
            }
        }
    }

    public showSearchMenu(cmdTree: MergeTree.TST<SearchMenu.ISearchMenuCommand>,
        foldCase = true,
        showAllInitially = false,
        cmdParser?: (searchString: string, cmd?: SearchMenu.ISearchMenuCommand) => void) {
        this.activeSearchBox =
            SearchMenu.searchBoxCreate(this, this.viewportDiv, cmdTree, foldCase, cmdParser);
        if (showAllInitially) {
            this.activeSearchBox.showAllItems();
        }
        return true;
    }

    public cancelSearchMenu() {
        this.activeSearchBox.dismiss();
        this.activeSearchBox = undefined;
    }

    public setEdit(docRoot: types.ISharedMap) {
        this.docRoot = docRoot;

        window.oncontextmenu = preventD;
        this.element.onmousemove = preventD;
        this.element.onmouseup = preventD;
        // TODO onmousewheel does not appear on DOM d.ts
        (this.element as any).onselectstart = preventD;
        let prevX = Nope;
        let prevY = Nope;
        let downX = Nope;
        let downY = Nope;
        let incluMarker: MergeTree.Marker;
        let freshDown = false;

        const moveObjects = (e: MouseEvent, fresh = false) => {
            if (e.button === 0) {
                prevX = e.clientX;
                prevY = e.clientY;
                const elm = document.elementFromPoint(prevX, prevY);
                if (elm) {
                    if (fresh) {
                        const refInclu = elm as IRefDiv;
                        if (refInclu.marker) {
                            this.movingInclusion.onTheMove = true;
                            incluMarker = refInclu.marker;
                            this.movingInclusion.exclu = refInclu.exclu;
                            this.movingInclusion.marker = incluMarker;
                        }
                    }
                    if (this.movingInclusion.onTheMove) {
                        // console.log(`moving inclusion to nowhere with ${prevX-downX},${prevY-downY}`);
                        const deltaX = prevX - downX;
                        const deltaY = prevY - downY;
                        const thresh = 2;
                        const dist = Math.abs(deltaX) + Math.abs(deltaY);
                        if (dist >= thresh) {
                            this.movingInclusion.dx = deltaX;
                            this.movingInclusion.dy = deltaY;
                            this.broadcastDragPresence();
                            this.render(this.topChar, true);
                        }
                    } else {
                        const span = elm as ISegSpan;
                        let segspan: ISegSpan;
                        if (span.seg) {
                            segspan = span;
                        } else {
                            segspan = span.parentElement as ISegSpan;
                        }
                        if (segspan && segspan.seg) {
                            this.clickSpan(e.clientX, e.clientY, segspan);
                        }
                    }
                }
            }
        };

        const mousemove = (e: MouseEvent) => {
            if (e.button === 0) {
                if ((prevX !== e.clientX) || (prevY !== e.clientY)) {
                    if (freshDown) {
                        this.cursor.tryMark();
                        freshDown = false;
                    }
                    moveObjects(e);
                }
                e.preventDefault();
                e.returnValue = false;
                return false;
            }
        };

        this.element.onmousedown = (e) => {
            this.element.focus();
            if (e.button === 0) {
                freshDown = true;
                downX = e.clientX;
                downY = e.clientY;
                moveObjects(e, true);
                if (!e.shiftKey) {
                    this.clearSelection();
                }
                this.element.onmousemove = mousemove;
            }
            e.stopPropagation();
            e.preventDefault();
            e.returnValue = false;
            return false;
        };

        this.element.onmouseup = (e) => {
            this.element.onmousemove = preventD;
            if (e.button === 0) {
                freshDown = false;
                if (this.movingInclusion.onTheMove) {
                    const toPos = this.movingInclusion.ulPos;
                    this.movingInclusion.dx = 0;
                    this.movingInclusion.dy = 0;
                    this.movingInclusion.onTheMove = false;
                    this.movingInclusion.ulPos = undefined;
                    this.broadcastDragPresence();
                    if (toPos !== undefined) {
                        // console.log(`moving to ${toPos}`);
                        const fromPos = getOffset(this, this.movingInclusion.marker);
                        moveMarker(this, fromPos, toPos);
                        this.updatePGInfo(fromPos);
                        this.updatePGInfo(toPos);
                    }
                    this.render(this.topChar, true);
                } else {
                    const elm = <HTMLElement>document.elementFromPoint(prevX, prevY);
                    const span = elm as ISegSpan;
                    let segspan: ISegSpan;
                    if (span.seg) {
                        segspan = span;
                    } else {
                        segspan = span.parentElement as ISegSpan;
                    }
                    if (segspan && segspan.seg) {
                        this.clickSpan(e.clientX, e.clientY, segspan);
                        if (this.cursor.emptySelection()) {
                            this.clearSelection();
                        }
                    }
                }
                e.stopPropagation();
                e.preventDefault();
                e.returnValue = false;
                return false;
            } else if (e.button === 2) {
                e.preventDefault();
                e.returnValue = false;
                return false;
            }
        };

        this.element.onblur = (e) => {
            // TODO: doesn't actually stop timer.
            this.cursor.hide();
        };

        this.element.onfocus = (e) => {
            // TODO: doesn't actually start timer.
            this.cursor.show();
        };

        // TODO onmousewheel does not appear on DOM d.ts
        (this.element as any).onmousewheel = (e) => {
            if (!this.wheelTicking) {
                const factor = 20;
                let inputDelta = e.wheelDelta;
                if (Math.abs(e.wheelDelta) === 120) {
                    inputDelta = e.wheelDelta / 6;
                } else {
                    inputDelta = e.wheelDelta / 2;
                }
                const delta = factor * inputDelta;
                // tslint:disable-next-line:max-line-length
                // console.log(`top char: ${this.topChar - delta} factor ${factor}; delta: ${delta} wheel: ${e.wheelDeltaY} ${e.wheelDelta} ${e.detail}`);
                setTimeout(() => {
                    this.render(Math.floor(this.topChar - delta));
                    this.apresScroll(delta < 0);
                    this.wheelTicking = false;
                }, 20);
                this.wheelTicking = true;
            }
            e.stopPropagation();
            e.preventDefault();
            e.returnValue = false;
        };

        const keydownHandler = (e: KeyboardEvent) => {
            if (this.focusChild) {
                this.focusChild.keydownHandler(e);
            } else if (this.activeSearchBox) {
                if (e.keyCode === KeyCode.esc) {
                    this.activeSearchBox.dismiss();
                    this.activeSearchBox = undefined;
                } else {
                    this.activeSearchBox.keydown(e);
                }
            } else {
                const saveLastVertX = this.lastVerticalX;
                let specialKey = true;
                this.lastVerticalX = -1;
                if (e.ctrlKey && (e.keyCode !== 17)) {
                    this.keyCmd(e.keyCode, e.shiftKey);
                } else if (e.keyCode === KeyCode.TAB) {
                    this.onTAB(e.shiftKey);
                } else if (e.keyCode === KeyCode.esc) {
                    this.clearSelection();
                } else if (e.keyCode === KeyCode.backspace) {
                    // TODO: in math region; don't backspace if region empty
                    const mathTileInfo = this.inMathGetMarker();
                    if (mathTileInfo) {
                        const mathMarker = mathTileInfo.tile as MathMenu.IMathMarker;
                        const toRemoveMath = MathMenu.bksp(mathMarker);
                        if (toRemoveMath) {
                            const beginTileInfo = findTile(this, mathTileInfo.pos - 1, "math", true);
                            if (this.modes.showCursorLocation) {
                                this.cursorLocation();
                            }
                            const adjPos = beginTileInfo.pos + 1;
                            this.sharedString.removeText(adjPos + toRemoveMath.start, adjPos + toRemoveMath.end);
                        }
                    } else if (this.getMathViewMarker()) {
                        this.mathComponentViewKeydown(e);
                    } else {
                        let toRemove = this.cursor.getSelection();
                        if (toRemove) {
                            // If there was a selected range, use it as range to remove below.  In preparation, clear
                            // the FlowView's selection and set the cursor to the start of the range to be deleted.
                            this.clearSelection();
                            this.cursor.pos = toRemove.start;
                        } else {
                            // Otherwise, construct the range to remove by moving the cursor once in the reverse direction.
                            // Below we will remove the positions spanned by the current and previous cursor positions.
                            const removeEnd = this.cursor.pos;
                            this.cursorRev();
                            toRemove = {
                                end: removeEnd,
                                start: this.cursor.pos,
                            };
                        }
                        if (this.modes.showCursorLocation) {
                            this.cursorLocation();
                        }
                        this.sharedString.removeText(toRemove.start, toRemove.end);
                    }
                } else if (((e.keyCode === KeyCode.pageUp) || (e.keyCode === KeyCode.pageDown)) && (!this.ticking)) {
                    setTimeout(() => {
                        this.scroll(e.keyCode === KeyCode.pageUp);
                        this.ticking = false;
                    }, 20);
                    this.ticking = true;
                } else if (e.keyCode === KeyCode.home) {
                    this.cursor.pos = FlowView.docStartPosition;
                    if (this.modes.showCursorLocation) {
                        this.cursorLocation();
                    }
                    this.render(FlowView.docStartPosition);
                } else if (e.keyCode === KeyCode.end) {
                    const halfport = Math.floor(this.viewportCharCount() / 2);
                    const topChar = this.client.getLength() - halfport;
                    this.cursor.pos = topChar;
                    if (this.modes.showCursorLocation) {
                        this.cursorLocation();
                    }
                    this.broadcastPresence();
                    this.render(topChar);
                } else if (e.keyCode === KeyCode.rightArrow) {
                    this.undoRedoManager.closeCurrentOperation();
                    if (this.cursor.pos < (this.client.getLength() - 1)) {
                        if (this.inMathGetMarker()) {
                            this.mathCursorFwd();
                        } else if (this.getMathViewMarker()) {
                            const marker = getContainingSegment(this, this.cursor.pos).segment as IMathViewMarker;
                            this.mathComponentViewCursorFwd(marker);
                        } else {
                            if (this.cursor.pos === this.viewportEndPos) {
                                this.scroll(false, true);
                            }
                            if (e.shiftKey) {
                                this.cursor.tryMark();
                            } else {
                                this.clearSelection();
                            }
                            this.cursorFwd();
                            const mathTileInfo = this.inMathGetMarker();
                            if (mathTileInfo) {
                                const mathMarker = mathTileInfo.tile as MathMenu.IMathMarker;
                                mathMarker.mathTokenIndex = 0;
                                mathMarker.mathCursor = 0;
                            }
                            this.broadcastPresence();
                            this.cursor.updateView(this);
                        }
                    }
                } else if (e.keyCode === KeyCode.leftArrow) {
                    this.undoRedoManager.closeCurrentOperation();
                    if (this.cursor.pos > FlowView.docStartPosition) {
                        if (this.inMathGetMarker()) {
                            this.mathCursorRev();
                        } else if (this.getMathViewMarker()) {
                            const marker = getContainingSegment(this, this.cursor.pos).segment as IMathViewMarker;
                            this.mathComponentViewCursorRev(marker);
                        } else {
                            if (this.cursor.pos === this.viewportStartPos) {
                                this.scroll(true, true);
                            }
                            if (e.shiftKey) {
                                this.cursor.tryMark();
                            } else {
                                this.clearSelection();
                            }
                            this.cursorRev();
                            const mathTileInfo = this.inMathGetMarker();
                            if (mathTileInfo) {
                                const mathMarker = mathTileInfo.tile as MathMenu.IMathMarker;
                                mathMarker.mathTokenIndex = mathMarker.mathTokens.length;
                                mathMarker.mathCursor = mathTileInfo.pos;
                            }
                            this.broadcastPresence();
                            this.cursor.updateView(this);
                        }
                    }
                } else if ((e.keyCode === KeyCode.upArrow) || (e.keyCode === KeyCode.downArrow)) {
                    this.undoRedoManager.closeCurrentOperation();
                    this.lastVerticalX = saveLastVertX;
                    let lineCount = 1;
                    if (e.keyCode === KeyCode.upArrow) {
                        lineCount = -1;
                    }
                    if (e.shiftKey) {
                        this.cursor.tryMark();
                    } else {
                        this.clearSelection();
                    }
                    const maxPos = this.client.getLength() - 1;
                    if (this.viewportEndPos > maxPos) {
                        this.viewportEndPos = maxPos;
                    }
                    const vpEnd = this.viewportEndPos;
                    if ((this.cursor.pos < maxPos) || (lineCount < 0)) {
                        let fromMath = false;
                        if (this.inMathGetMarker()) {
                            fromMath = true;
                        }
                        if (!this.verticalMove(lineCount)) {
                            if (((this.viewportStartPos > 0) && (lineCount < 0)) ||
                                ((this.viewportEndPos < maxPos) && (lineCount > 0))) {
                                this.scroll(lineCount < 0, true);
                                if (lineCount > 0) {
                                    while (vpEnd === this.viewportEndPos) {
                                        if (this.cursor.pos > maxPos) {
                                            this.cursor.pos = maxPos;
                                            break;
                                        }
                                        this.scroll(lineCount < 0, true);
                                    }
                                }
                                this.verticalMove(lineCount);
                            }
                        }
                        if (this.cursor.pos > maxPos) {
                            this.cursor.pos = maxPos;
                        }
                        this.broadcastPresence();
                        this.cursor.updateView(this);
                        if (this.inMathGetMarker()) {
                            this.mathNormalizeCursor();
                            fromMath = true;
                        }
                        if (fromMath) {
                            this.localQueueRender(this.cursor.pos);
                        }
                    }
                } else {
                    if (!e.ctrlKey) {
                        specialKey = false;
                    }
                }
                if (specialKey) {
                    e.preventDefault();
                    e.returnValue = false;
                }
            }
        };

        const keypressHandler = (e: KeyboardEvent) => {
            if (this.focusChild) {
                this.focusChild.keypressHandler(e);
            } else if (this.activeSearchBox) {
                if (this.activeSearchBox.keypress(e)) {
                    this.activeSearchBox.dismiss();
                    this.activeSearchBox = undefined;
                }
            } else {
                const pos = this.cursor.pos;
                const code = e.charCode;
                if (code === CharacterCodes.cr) {
                    // TODO: other labels; for now assume only list/pg tile labels
                    this.insertParagraph(this.cursor.pos++);
                } else {
                    const mathTileInfo = this.inMathGetMarker();

                    if (mathTileInfo) {
                        if (code === CharacterCodes.backslash) {
                            this.activeSearchBox = MathMenu.mathMenuCreate(this, this.viewportDiv,
                                (s, cmd) => {
                                    let text = "\\" + s;
                                    if (cmd) {
                                        text = cmd.texString;
                                    }
                                    this.sharedString.insertText(text, pos);
                                });
                            this.activeSearchBox.showAllItems();
                        } else {
                            const toInsert = MathMenu.transformInputCode(code);
                            if (toInsert) {
                                this.sharedString.insertText(toInsert, pos);
                            } else {
                                console.log(`unrecognized math input ${e.char}`);
                            }
                        }
                    } else if (this.getMathViewMarker()) {
                        this.mathComponentViewKeypress(e);
                    } else {
                        this.sharedString.insertText(String.fromCharCode(code), pos);
                        if (code === CharacterCodes.space) {
                            this.undoRedoManager.closeCurrentOperation();
                        }
                    }
                    this.clearSelection();
                    if (this.modes.showCursorLocation) {
                        this.cursorLocation();
                    }
                }
            }
        };

        // Register for keyboard messages
        this.on("keydown", keydownHandler);
        this.on("keypress", keypressHandler);
        this.keypressHandler = keypressHandler;
        this.keydownHandler = keydownHandler;
    }

    // add caching
    public getMathViewMarker() {
        const segment = getContainingSegment(this, this.cursor.pos).segment;
        if (MergeTree.Marker.is(segment)) {
            if (isMathComponentView(segment as MergeTree.Marker)) {
                return segment as IMathViewMarker;
            }
        }
    }

    public mathComponentViewKeypress(e: KeyboardEvent) {
        const marker = this.getMathViewMarker();
        if (!marker.instance) {
            this.loadMath(marker);
        }
        marker.instance.onKeypress(e);
    }

    public mathComponentViewKeydown(e: KeyboardEvent) {
        const marker = this.getMathViewMarker();
        if (!marker.instance) {
            this.loadMath(marker);
        }
        marker.instance.onKeydown(e);
    }

    public mathComponentViewCursorFwd(marker: IMathViewMarker) {
        if (!marker.instance) {
            this.loadMath(marker);
        }
        if (marker.instance.fwd()) {
            marker.instance.leave(ComponentCursorDirection.Right);
            this.cursor.enable();
            this.cursorFwd();
        }
        this.broadcastPresence();
        this.cursor.updateView(this);
    }

    public mathComponentViewCursorRev(marker: IMathViewMarker) {
        if (!marker.instance) {
            this.loadMath(marker);
        }
        if (marker.instance.rev()) {
            marker.instance.leave(ComponentCursorDirection.Left);
            this.cursorRev();
            this.cursor.enable();
        }
        this.broadcastPresence();
        this.cursor.updateView(this);
    }

    public mathCursorFwd() {
        const endTileInfo = findTile(this, this.cursor.pos, "math", false);
        const mathMarker = endTileInfo.tile as MathMenu.IMathMarker;
        mathMarker.mathTokenIndex = MathMenu.mathTokFwd(mathMarker.mathTokenIndex,
            mathMarker.mathTokens);
        MathMenu.printMathMarker(mathMarker);
        if (mathMarker.mathTokenIndex > mathMarker.mathTokens.length) {
            this.cursor.pos = endTileInfo.pos + 1;
        } else if (mathMarker.mathTokenIndex === mathMarker.mathTokens.length) {
            this.cursor.pos = endTileInfo.pos;
        } else {
            mathMarker.mathCursor = MathMenu.posAtToken(mathMarker.mathTokenIndex, mathMarker.mathTokens);
            let pos = this.cursor.pos;
            if (pos === endTileInfo.pos) {
                pos--;
            }
            const beginTileInfo = findTile(this, pos, "math", true);
            this.cursor.pos = beginTileInfo.pos + 1 + mathMarker.mathCursor;
        }
        this.broadcastPresence();
        this.cursor.updateView(this);
    }

    public mathCursorRev() {
        const endTileInfo = findTile(this, this.cursor.pos, "math", false);
        let pos = this.cursor.pos;
        if (pos === endTileInfo.pos) {
            pos--;
        }
        const beginTileInfo = findTile(this, pos, "math", true);
        const mathMarker = endTileInfo.tile as MathMenu.IMathMarker;
        mathMarker.mathTokenIndex = MathMenu.mathTokRev(mathMarker.mathTokenIndex,
            mathMarker.mathTokens);
        MathMenu.printMathMarker(mathMarker);
        if (mathMarker.mathTokenIndex === MathMenu.Nope) {
            this.cursor.pos = beginTileInfo.pos;
            mathMarker.mathTokenIndex = 0;
        } else {
            mathMarker.mathCursor = MathMenu.posAtToken(mathMarker.mathTokenIndex, mathMarker.mathTokens);
            this.cursor.pos = beginTileInfo.pos + 1 + mathMarker.mathCursor;
        }
        this.broadcastPresence();
        this.cursor.updateView(this);
    }

    // put the cursor at ... (but for now put it at end)
    public mathNormalizeCursor() {
        const endTileInfo = findTile(this, this.cursor.pos, "math", false);
        this.cursor.pos = endTileInfo.pos;
        const mathMarker = endTileInfo.tile as MathMenu.IMathMarker;
        if (mathMarker.mathTokens) {
            mathMarker.mathTokenIndex = mathMarker.mathTokens.length;
            mathMarker.mathCursor = MathMenu.posAtToken(mathMarker.mathTokenIndex, mathMarker.mathTokens);
        } else {
            const beginTileInfo = findTile(this, endTileInfo.pos - 1, "math", true);
            const mathText = this.sharedString.getText(beginTileInfo.pos + 1, endTileInfo.pos);
            MathMenu.initMathMarker(mathMarker, mathText);
        }
    }

    public inMathGetMarker() {
        const tileInfo = findTile(this, this.cursor.pos, "math", false);
        if (tileInfo && (tileInfo.tile.properties.mathEnd)) {
            return tileInfo;
        }
    }

    public endOfMathRegion(posInRegion: number) {
        const tileInfo = findTile(this, posInRegion, "math", false);
        return tileInfo.pos;
    }

    public mathMarkerPostRemove(mathMarker: MathMenu.IMathMarker, endPos: number) {
        const beginTileInfo = findTile(this, endPos - 1, "math", true);
        const mathText = this.sharedString.getText(beginTileInfo.pos + 1, endPos);
        mathMarker.mathText = mathText;
        mathMarker.mathTokens = MathMenu.lexMath(mathText);
        console.log("math backspace token");
        MathMenu.printMathMarker(mathMarker);
    }

    public mathMarkerPostInsert(mathMarker: MathMenu.IMathMarker, endPos: number) {
        const beginTileInfo = findTile(this, endPos - 1, "math", true);
        const mathText = this.sharedString.getText(beginTileInfo.pos + 1, endPos);
        mathMarker.mathText = mathText;
        mathMarker.mathTokens = MathMenu.lexMath(mathText);
        MathMenu.printMathMarker(mathMarker);
        mathMarker.mathTokenIndex = MathMenu.mathTokFwd(mathMarker.mathTokenIndex, mathMarker.mathTokens);
        mathMarker.mathCursor = MathMenu.posAtToken(mathMarker.mathTokenIndex, mathMarker.mathTokens);
        this.cursor.pos = beginTileInfo.pos + 1 + mathMarker.mathCursor;
        console.log("advance math token");
        MathMenu.printMathMarker(mathMarker);
    }

    public enterMathMode() {
        this.sharedString.insertMarker(this.cursor.pos++, MergeTree.ReferenceType.Tile,
            { [MergeTree.reservedTileLabelsKey]: ["math"], mathStart: true });
        this.sharedString.insertMarker(this.cursor.pos, MergeTree.ReferenceType.Tile,
            { [MergeTree.reservedTileLabelsKey]: ["math"], mathEnd: true });
        const tileInfo = this.inMathGetMarker();
        const mathMarker = tileInfo.tile as MathMenu.IMathMarker;
        mathMarker.mathTokenIndex = 0;
        mathMarker.mathTokens = [] as MathMenu.MathToken[];
        mathMarker.mathCursor = 0;
        mathMarker.mathText = "";
        this.clearSelection();
        if (this.modes.showCursorLocation) {
            this.cursorLocation();
        }
        this.updatePGInfo(this.cursor.pos);
        this.localQueueRender(this.cursor.pos);
    }

    public viewTileProps() {
        let searchPos = this.cursor.pos;
        if (this.cursor.pos === this.cursor.lineDiv().lineEnd) {
            searchPos--;
        }
        const tileInfo = findTile(this, searchPos, "pg", false);
        if (tileInfo) {
            let buf = "";
            if (tileInfo.tile.properties) {
                // tslint:disable:forin
                for (const key in tileInfo.tile.properties) {
                    buf += ` { ${key}: ${tileInfo.tile.properties[key]} }`;
                }
            }

            const lc = !!(tileInfo.tile as Paragraph.IParagraphMarker).listCache;
            console.log(`tile at pos ${tileInfo.pos} with props${buf} and list cache: ${lc}`);
        }
    }

    public setList(listKind = 0) {
        this.undoRedoManager.closeCurrentOperation();
        const searchPos = this.cursor.pos;
        const tileInfo = findTile(this, searchPos, "pg", false);
        if (tileInfo) {
            const tile = tileInfo.tile as Paragraph.IParagraphMarker;
            let listStatus = false;
            if (tile.hasTileLabel("list")) {
                listStatus = true;
            }
            const curLabels = tile.properties[MergeTree.reservedTileLabelsKey] as string[];

            if (listStatus) {
                const remainingLabels = curLabels.filter((l) => l !== "list");
                this.sharedString.annotateRange({
                    [MergeTree.reservedTileLabelsKey]: remainingLabels,
                    series: null,
                }, tileInfo.pos, tileInfo.pos + 1);
            } else {
                const augLabels = curLabels.slice();
                augLabels.push("list");
                let indentLevel = 1;
                if (tile.properties && tile.properties.indentLevel) {
                    indentLevel = tile.properties.indentLevel;
                }
                this.sharedString.annotateRange({
                    [MergeTree.reservedTileLabelsKey]: augLabels,
                    indentLevel,
                    listKind,
                }, tileInfo.pos, tileInfo.pos + 1);
            }
            tile.listCache = undefined;
        }
        this.undoRedoManager.closeCurrentOperation();
    }

    public tryMoveCell(pos: number, shift = false) {
        const cursorContext =
            this.client.mergeTree.getStackContext(pos, this.client.getClientId(), ["table", "cell", "row"]);
        if (cursorContext.table && (!cursorContext.table.empty())) {
            const tableMarker = cursorContext.table.top() as Table.ITableMarker;
            const tableView = tableMarker.table;
            if (cursorContext.cell && (!cursorContext.cell.empty())) {
                const cell = cursorContext.cell.top() as Table.ICellMarker;
                let toCell: Table.Cell;
                if (shift) {
                    toCell = tableView.prevcell(cell.cell);
                } else {
                    toCell = tableView.nextcell(cell.cell);
                }
                if (toCell) {
                    const offset = this.client.mergeTree.getOffset(toCell.marker,
                        MergeTree.UniversalSequenceNumber, this.client.getClientId());
                    this.cursor.pos = offset + 1;
                } else {
                    if (shift) {
                        const offset = this.client.mergeTree.getOffset(tableView.tableMarker,
                            MergeTree.UniversalSequenceNumber, this.client.getClientId());
                        this.cursor.pos = offset - 1;
                    } else {
                        const endOffset = this.client.mergeTree.getOffset(tableView.endTableMarker,
                            MergeTree.UniversalSequenceNumber, this.client.getClientId());
                        this.cursor.pos = endOffset + 1;
                    }
                }
                this.broadcastPresence();
                this.cursor.updateView(this);
            }
            return true;
        } else {
            return false;
        }
    }

    // TODO: tab stops in non-list, non-table paragraphs
    public onTAB(shift = false) {
        const searchPos = this.cursor.pos;
        const tileInfo = findTile(this, searchPos, "pg", false);
        if (tileInfo) {
            if (!this.tryMoveCell(tileInfo.pos, shift)) {
                const tile = tileInfo.tile as Paragraph.IParagraphMarker;
                this.increaseIndent(tile, tileInfo.pos, shift);
            }
        }
    }

    public toggleBlockquote() {
        const tileInfo = findTile(this, this.cursor.pos, "pg", false);
        if (tileInfo) {
            const tile = tileInfo.tile;
            const props = tile.properties;
            this.undoRedoManager.closeCurrentOperation();
            if (props && props.blockquote) {
                this.sharedString.annotateRange({ blockquote: false }, tileInfo.pos, tileInfo.pos + 1);
            } else {
                this.sharedString.annotateRange({ blockquote: true }, tileInfo.pos, tileInfo.pos + 1);
            }
            this.undoRedoManager.closeCurrentOperation();
        }
    }

    public toggleBold() {
        this.toggleWordOrSelection("fontWeight", "bold", null);
    }

    public toggleItalic() {
        this.toggleWordOrSelection("fontStyle", "italic", "normal");
    }

    public toggleUnderline() {
        this.toggleWordOrSelection("textDecoration", "underline", null);
    }

    public copyFormat() {
        const segoff = getContainingSegment(this, this.cursor.pos);
        if (segoff.segment && MergeTree.TextSegment.is((segoff.segment))) {
            this.formatRegister = MergeTree.extend(MergeTree.createMap(), segoff.segment.properties);
        }
    }

    public setProps(props: MergeTree.PropertySet, updatePG = true) {
        const sel = this.cursor.getSelection();
        this.undoRedoManager.closeCurrentOperation();
        if (sel) {
            this.clearSelection(false);
            this.sharedString.annotateRange(props, sel.start, sel.end);
        } else {
            const wordRange = getCurrentWord(this.cursor.pos, this.sharedString.client.mergeTree);
            if (wordRange) {
                this.sharedString.annotateRange(props, wordRange.wordStart, wordRange.wordEnd);
            }
        }
        this.undoRedoManager.closeCurrentOperation();
    }

    public paintFormat() {
        if (this.formatRegister) {
            this.setProps(this.formatRegister);
        }
    }

    public setFont(family: string, size = "18px") {
        this.setProps({ fontFamily: family, fontSize: size });
    }

    public setBGImage(imageName: string, setSize?: boolean) {
        this.viewportDiv.style.backgroundImage = imageName;
        if (setSize) {
            const rect = this.viewportDiv.getBoundingClientRect();
            this.viewportDiv.style.backgroundSize = `${rect.width}px ${rect.height}px`;
        }
    }

    public clearBGImage() {
        this.viewportDiv.style.backgroundImage = undefined;
    }

    public setColor(color: string) {
        this.setProps({ color }, false);
    }

    public makeBlink(color: string) {
        this.setProps({ blink: true, color }, false);
    }

    public toggleWordOrSelection(name: string, valueOn: string, valueOff: string) {
        const sel = this.cursor.getSelection();
        if (sel) {
            this.clearSelection(false);
            this.toggleRange(name, valueOn, valueOff, sel.start, sel.end);
        } else {
            const wordRange = getCurrentWord(this.cursor.pos, this.sharedString.client.mergeTree);
            if (wordRange) {
                this.toggleRange(name, valueOn, valueOff, wordRange.wordStart, wordRange.wordEnd);
            }
        }
    }

    public toggleRange(name: string, valueOn: string, valueOff: string, start: number, end: number) {
        let someSet = false;
        const findPropSet = (segment: MergeTree.ISegment) => {
            if (MergeTree.TextSegment.is(segment)) {
                if (segment.properties && segment.properties[name] === valueOn) {
                    someSet = true;
                }
                return !someSet;
            }
        };
        this.sharedString.client.mergeTree.mapRange({ leaf: findPropSet }, MergeTree.UniversalSequenceNumber,
            this.sharedString.client.getClientId(), undefined, start, end);
        this.undoRedoManager.closeCurrentOperation();
        if (someSet) {
            this.sharedString.annotateRange({ [name]: valueOff }, start, end);
        } else {
            this.sharedString.annotateRange({ [name]: valueOn }, start, end);
        }
        this.undoRedoManager.closeCurrentOperation();
    }

    public showAdjacentBookmark(before = true) {
        if (this.bookmarks) {
            let result: Sequence.SharedStringInterval;
            if (before) {
                result = this.bookmarks.previousInterval(this.cursor.pos);
            } else {
                result = this.bookmarks.nextInterval(this.cursor.pos);
            }
            if (result) {
                const s = result.start.toPosition(this.client.mergeTree,
                    MergeTree.UniversalSequenceNumber, this.client.getClientId());
                const e = result.end.toPosition(this.client.mergeTree,
                    MergeTree.UniversalSequenceNumber, this.client.getClientId());
                let descr = "next ";
                if (before) {
                    descr = "previous ";
                }
                console.log(`${descr} bookmark is [${s},${e})`);
                this.tempBookmarks = [result];
                this.localQueueRender(this.cursor.pos);
            }
        }
    }

    public cursorLocation() {
        this.statusMessage("cursor", `Cursor: ${this.cursor.pos} `);
    }

    public geocodeAddress() {
        const sel = this.cursor.getSelection();
        if (sel) {
            const text = this.sharedString.getText(sel.start, sel.end);
            Geocoder.geocode(text, (err, data) => console.log(data),
                { key: "AIzaSyCY3kHHzocQSos6QNOzJINWmNo_a4IqN-8" });
        }
    }

    public showKatex() {
        const sel = this.cursor.getSelection();
        if (sel) {
            const text = this.sharedString.getText(sel.start, sel.end);
            const html = Katex.renderToString(text, { throwOnError: false });
            this.statusMessage("math", html);
        }
    }

    public showCommentText() {
        const overlappingComments = this.commentsView.findOverlappingIntervals(this.cursor.pos,
            this.cursor.pos + 1);
        if (overlappingComments && (overlappingComments.length >= 1)) {
            const commentInterval = overlappingComments[0];
            const commentText = commentInterval.properties["story"].getText();
            this.statusMessage("comment", "Comment Text: " + commentText);
            setTimeout(() => {
                this.status.remove("comment");
            }, (10000));
        }
    }

    public createComment() {
        const sel = this.cursor.getSelection();
        if (sel) {
            const commentStory = this.collabDocument.createString();
            commentStory.insertText("a comment...", 0);
            commentStory.attach();
            this.comments.add(
                sel.start,
                sel.end,
                MergeTree.IntervalType.Simple,
                { story: commentStory });
            this.cursor.clearSelection();
            this.localQueueRender(this.cursor.pos);
        }
    }

    /** Insert a Sheetlet. */
    public insertSheetlet() {
        this.insertComponent("sheetlet", {});
    }

    public insertInnerComponent(prefix: string, chaincode: string) {
        const id = `${prefix}${Date.now()}`;

        this.collabDocument.context.createAndAttachComponent(id, chaincode);

        this.insertComponent("innerComponent", { id, chaincode });
    }

    public insertComponentNew(prefix: string, chaincode: string, inline = false) {
        const id = `${prefix}-${Date.now()}`;

        this.collabDocument.context.createAndAttachComponent(id, chaincode);

        const props = {
            crefTest: {
                layout: { inline },
                type: {
                    name: "component",
                } as IReferenceDocType,
                url: id,
            },
            leafId: id,
        };

        if (!inline) {
            this.insertParagraph(this.cursor.pos++);
        }

        const markerPos = this.cursor.pos;
        this.sharedString.insertMarker(markerPos, MergeTree.ReferenceType.Simple, props);
    }

    public loadMath(mathMarker: IMathViewMarker) {
        if (!mathMarker.instance) {
            const inline = mathMarker.properties.crefTest.layout.inline;
            const mathOptions: IMathOptions = { displayType: inline ? ComponentDisplayType.Inline : ComponentDisplayType.Block };
            const mathInstance = this.math.getInstance(mathMarker.properties.leafId, mathOptions);
            mathMarker.instance = mathInstance;
            if (mathInstance.query("ISearchMenuClient")) {
                mathInstance.registerSearchMenuHost(this);
            }
        }
    }

    public insertMath(inline = true) {
        const mathOptions: IMathOptions = { displayType: inline ? ComponentDisplayType.Inline : ComponentDisplayType.Block };
        const mathInstance = this.math.create(mathOptions);
        const props = {
            crefTest: {
                layout: { inline },
                type: {
                    name: "math",
                } as IReferenceDocType,
                url: mathInstance.id,
            },
            // change this to just use url and IComponentRouter on collection
            leafId: mathInstance.leafId,
        };
        if (!inline) {
            this.insertParagraph(this.cursor.pos++);
        }
        const markerPos = this.cursor.pos;
        this.sharedString.insertMarker(markerPos, MergeTree.ReferenceType.Simple, props);
        const mathMarker = getContainingSegment(this, markerPos).segment as IMathViewMarker;
        mathMarker.instance = mathInstance;
        mathInstance.registerSearchMenuHost(this);
        this.cursor.disable();
        this.componentCursor = mathMarker.instance;
        mathMarker.instance.enter(ComponentCursorDirection.Left);
    }

    public insertVideoPlayer(inline = false) {
        // TODO - we may want to have a shared component collection?
        const instance = this.videoPlayers.create() as ISharedComponent;

        const props = {
            crefTest: {
                layout: { inline },
                type: {
                    name: "component",
                } as IReferenceDocType,
                url: instance.url,
            },
            leafId: instance.url,
        };

        if (!inline) {
            this.insertParagraph(this.cursor.pos++);
        }

        const markerPos = this.cursor.pos;
        this.sharedString.insertMarker(markerPos, MergeTree.ReferenceType.Simple, props);
    }

    public insertProgressBar() {
        const instance = this.progressBars.create();
        this.insertComponent("innerComponent", { id: instance.url });
    }

    /** Insert an external Document */
    public insertDocument(url: string) {
        this.insertComponent("document", { url });
    }

    /** Insert a Formula box to display the given 'formula'. */
    public insertFormula(formula: string) {
        this.insertComponent("formula", { formula });
    }

    /** Insert a Slider box to display the given 'formula'. */
    public insertSlider(value: string) {
        this.insertComponent("slider", { value });
    }

    public insertList() {
        const testList: SearchMenu.ISearchMenuCommand[] = [{ key: "providence" }, { key: "boston" }, { key: "issaquah" }];
        const irdoc = <IListReferenceDoc>{
            items: testList,
            referenceDocId: "L",
            selectionIndex: 0,
            type: { name: "list" },
            url: "",
        };
        const refProps = {
            [Paragraph.referenceProperty]: irdoc,
        };
        this.sharedString.insertMarker(this.cursor.pos++, MergeTree.ReferenceType.Simple, refProps);
    }

    public insertPhoto() {
        urlToInclusion(`${baseURI}/public/images/bennet1.jpeg`)
            .then(async (incl) => {
                this.collabDocument.uploadBlob(incl)
                    .then((blob) => {
                        this.insertBlobInternal(blob);
                    });
            })
            .catch((error) => {
                console.log(error);
            });
    }

    public insertVideo() {
        urlToInclusion(`${baseURI}/public/images/SampleVideo_1280x720_1mb.mp4`)
            .then(async (incl) => {
                this.insertBlobInternal(await this.collabDocument.uploadBlob(incl));
            })
            .catch((error) => {
                console.log(error);
            });
    }

    private async openCollections() {
        const [mathPlatform, progressBarsPlatform] = await Promise.all([
            this.openPlatform("math"),
            this.openPlatform("progress-bars"),
            this.openPlatform("video-players"),
        ]);

        const [progressBars, math, videoPlayers] = await Promise.all([
            this.openPlatform<ProgressCollection>("progress-bars"),
            this.openPlatform<IMathCollection>("math"),
            this.openCollection("video-players"),
        ]);

        this.progressBars = progressBars;
        this.math = math;
        this.videoPlayers = videoPlayers;
    }

    private async openCollection(id: string): Promise<IComponentCollection> {
        const runtime = await this.collabDocument.context.getComponentRuntime(id, true);
        const request = await runtime.request({ url: "/" });

        if (request.status !== 200 || request.mimeType !== "prague/component") {
            return Promise.reject("Not found");
        }

        const component = request.value as IComponent;
        return component.query<IComponentCollection>("IComponentCollection");
    }

    // TODO openPlatform should be removed in favor of openCollection
    private async openPlatform<T>(id: string): Promise<T> {
        const runtime = await this.collabDocument.context.getComponentRuntime(id, true);
        const component = await runtime.request({ url: "/" });

        if (component.status !== 200 || component.mimeType !== "prague/component") {
            return Promise.reject("Not found");
        }

        return component.value as T;
    }

    private insertBlobInternal(blob: IGenericBlob) {
        this.collabDocument.getBlob(blob.id)
            .then((finalBlob) => {
                makeBlobRef(finalBlob, (irdoc) => {
                    const refProps = {
                        [Paragraph.referenceProperty]: irdoc,
                    };
                    this.sharedString.insertMarker(this.cursor.pos, MergeTree.ReferenceType.Simple, refProps);
                });
            });
    }

    // tslint:disable:member-ordering
    public copy() {
        const sel = this.cursor.getSelection();
        if (sel) {
            this.sharedString.copy(sel.start, sel.end, "clipboard");
            this.clearSelection();
        }
    }

    public cut() {
        const sel = this.cursor.getSelection();
        if (sel) {
            const len = sel.end - sel.start;
            this.sharedString.cut(sel.start, sel.end, "clipboard");
            if (this.cursor.pos === sel.end) {
                this.cursor.pos -= len;
            }
            this.clearSelection();
            if (this.modes.showCursorLocation) {
                this.cursorLocation();
            }
            this.broadcastPresence();
        }
    }

    public paste() {
        this.updatePGInfo(this.cursor.pos);
        this.cursor.pos = this.sharedString.paste(this.cursor.pos, "clipboard");
        this.updatePGInfo(this.cursor.pos);
        this.broadcastPresence();
        if (this.modes.showCursorLocation) {
            this.cursorLocation();
        }
    }

    public deleteRow() {
        const stack =
            this.sharedString.client.mergeTree.getStackContext(this.cursor.pos,
                this.sharedString.client.getClientId(), ["table", "cell", "row"]);
        if (stack.table && (!stack.table.empty())) {
            const tableMarker = stack.table.top() as Table.ITableMarker;
            const rowMarker = stack.row.top() as Table.IRowMarker;
            if (!tableMarker.table) {
                const tableMarkerPos = getOffset(this, tableMarker);
                Table.parseTable(tableMarker, tableMarkerPos, this.sharedString, makeFontInfo(this.lastDocContext));
            }
            Table.deleteRow(this.sharedString, rowMarker.row, tableMarker.table);
        }
    }

    public deleteCellShiftLeft() {
        const stack =
            this.sharedString.client.mergeTree.getStackContext(this.cursor.pos,
                this.sharedString.client.getClientId(), ["table", "cell", "row"]);
        if (stack.table && (!stack.table.empty())) {
            const tableMarker = stack.table.top() as Table.ITableMarker;
            const cellMarker = stack.cell.top() as Table.ICellMarker;
            if (!tableMarker.table) {
                const tableMarkerPos = getOffset(this, tableMarker);
                Table.parseTable(tableMarker, tableMarkerPos, this.sharedString, makeFontInfo(this.lastDocContext));
            }
            Table.deleteCellShiftLeft(this.sharedString, cellMarker.cell, tableMarker.table);
        }
    }

    public deleteColumn() {
        const stack =
            this.sharedString.client.mergeTree.getStackContext(this.cursor.pos,
                this.sharedString.client.getClientId(), ["table", "cell", "row"]);
        if (stack.table && (!stack.table.empty())) {
            const tableMarker = stack.table.top() as Table.ITableMarker;
            const rowMarker = stack.row.top() as Table.IRowMarker;
            const cellMarker = stack.cell.top() as Table.ICellMarker;
            if (!tableMarker.table) {
                const tableMarkerPos = getOffset(this, tableMarker);
                Table.parseTable(tableMarker, tableMarkerPos, this.sharedString, makeFontInfo(this.lastDocContext));
            }
            Table.deleteColumn(this.sharedString, cellMarker.cell, rowMarker.row, tableMarker.table);
        }
    }

    public insertRow() {
        const stack =
            this.sharedString.client.mergeTree.getStackContext(this.cursor.pos,
                this.sharedString.client.getClientId(), ["table", "cell", "row"]);
        if (stack.table && (!stack.table.empty())) {
            const tableMarker = stack.table.top() as Table.ITableMarker;
            const rowMarker = stack.row.top() as Table.IRowMarker;
            if (!tableMarker.table) {
                const tableMarkerPos = getOffset(this, tableMarker);
                Table.parseTable(tableMarker, tableMarkerPos, this.sharedString, makeFontInfo(this.lastDocContext));
            }
            Table.insertRow(this.sharedString, rowMarker.row, tableMarker.table);
        }
    }

    public tableSummary() {
        const stack =
            this.sharedString.client.mergeTree.getStackContext(this.cursor.pos,
                this.sharedString.client.getClientId(), ["table", "cell", "row"]);
        if (stack.table && (!stack.table.empty())) {
            const tableMarker = stack.table.top() as Table.ITableMarker;
            const tableMarkerPos = getOffset(this, tableMarker);
            if (!tableMarker.table) {
                Table.parseTable(tableMarker, tableMarkerPos, this.sharedString, makeFontInfo(this.lastDocContext));
            }
            Table.succinctPrintTable(tableMarker, tableMarkerPos, this.sharedString);
        }
    }

    public randomCell(table: Table.Table) {
        let cellCount = 0;
        for (const row of table.rows) {
            if (!Table.rowIsMoribund(row.rowMarker)) {
                for (const cell of row.cells) {
                    if (!Table.cellIsMoribund(cell.marker)) {
                        cellCount++;
                    }
                }
            }
        }
        if (cellCount > 0) {
            const randIndex = Math.round(Math.random() * cellCount);
            cellCount = 0;
            for (const row of table.rows) {
                if (!Table.rowIsMoribund(row.rowMarker)) {
                    for (const cell of row.cells) {
                        if (!Table.cellIsMoribund(cell.marker)) {
                            if (cellCount === randIndex) {
                                return cell;
                            }
                            cellCount++;
                        }
                    }
                }
            }
        }
    }

    public crazyTable(k: number) {
        let count = 0;
        let rowCount = 0;
        let columnCount = 0;
        const stack =
            this.sharedString.client.mergeTree.getStackContext(this.cursor.pos,
                this.sharedString.client.getClientId(), ["table", "cell", "row"]);
        if (stack.table && (!stack.table.empty())) {
            const tableMarker = stack.table.top() as Table.ITableMarker;
            const randomTableOp = () => {
                count++;
                if (!tableMarker.table) {
                    const tableMarkerPos = getOffset(this, tableMarker);
                    Table.parseTable(tableMarker, tableMarkerPos, this.sharedString, makeFontInfo(this.lastDocContext));
                }
                const randCell = this.randomCell(tableMarker.table);
                if (randCell) {
                    const pos = getOffset(this, randCell.marker);
                    this.cursor.pos = pos;
                    this.cursor.updateView(this);
                    let hit = false;
                    if (rowCount < 8) {
                        const chance = Math.round(Math.random() * 10);
                        if (chance >= 5) {
                            this.insertRow();
                            rowCount++;
                            hit = true;
                        }
                    }
                    if ((columnCount < 8) && (!hit)) {
                        const chance = Math.round(Math.random() * 10);
                        if (chance >= 5) {
                            this.insertColumn();
                            columnCount++;
                            hit = true;
                        }
                    }
                    if ((rowCount > 4) && (!hit)) {
                        const chance = Math.round(Math.random() * 10);
                        if (chance >= 5) {
                            this.deleteRow();
                            rowCount--;
                            hit = true;
                        }
                    }
                    if ((columnCount > 4) && (!hit)) {
                        const chance = Math.round(Math.random() * 10);
                        if (chance >= 5) {
                            this.deleteColumn();
                            columnCount--;
                            hit = true;
                        }
                    }
                } else {
                    return;
                }
                if (count < k) {
                    setTimeout(randomTableOp, 200);
                }
            };
            setTimeout(randomTableOp, 200);
        }
    }

    public insertColumn() {
        const stack =
            this.sharedString.client.mergeTree.getStackContext(this.cursor.pos,
                this.sharedString.client.getClientId(), ["table", "cell", "row"]);
        if (stack.table && (!stack.table.empty())) {
            const tableMarker = stack.table.top() as Table.ITableMarker;
            const rowMarker = stack.row.top() as Table.IRowMarker;
            const cellMarker = stack.cell.top() as Table.ICellMarker;
            if (!tableMarker.table) {
                const tableMarkerPos = getOffset(this, tableMarker);
                Table.parseTable(tableMarker, tableMarkerPos, this.sharedString, makeFontInfo(this.lastDocContext));
            }
            Table.insertColumn(this.sharedString, cellMarker.cell, rowMarker.row, tableMarker.table);
        }
    }

    public setPGProps(props: MergeTree.PropertySet) {
        const tileInfo = findTile(this, this.cursor.pos, "pg", false);
        if (tileInfo) {
            const pgMarker = tileInfo.tile as Paragraph.IParagraphMarker;
            this.sharedString.annotateRange(props, tileInfo.pos,
                pgMarker.cachedLength + tileInfo.pos);
            Paragraph.clearContentCaches(pgMarker);
        }
    }

    public selectAll() {
        this.cursor.clearSelection();
        this.cursor.mark = 0;
        this.cursor.pos = this.sharedString.getLength();
    }

    public keyCmd(charCode: number, shift = false) {
        switch (charCode) {
            case CharacterCodes.A:
                this.selectAll();
                break;
            case CharacterCodes.C:
                this.copy();
                break;
            case CharacterCodes.X:
                this.cut();
                break;
            case CharacterCodes.V:
                this.paste();
                break;
            case CharacterCodes.K:
                this.historyBack();
                break;
            case CharacterCodes.J:
                this.historyForward();
                break;
            case CharacterCodes.Q:
                this.backToTheFuture();
                break;
            case CharacterCodes.R: {
                this.updatePGInfo(this.cursor.pos - 1);
                Table.createTable(this.cursor.pos, this.sharedString);
                break;
            }
            case CharacterCodes.M: {
                const cmdParser = (searchString: string) => {
                    // TODO: A micro-language for inserting components would be helpful here.
                    // If it starts with "=", assume it's a formula definition.
                    if (searchString.startsWith("=")) {
                        this.insertFormula(searchString);
                    }

                    // If it starts with "*", assume it's a slider definition.
                    if (searchString.startsWith("*")) {
                        this.insertSlider("=" + searchString.substring(1));
                    }

                    // If it starts with &, assume it's a document ID
                    if (searchString.startsWith("&")) {
                        const [id, pkg] = searchString.substring(1).split(" ");
                        this.insertInnerComponent(id, pkg);
                    }
                };
                this.activeSearchBox = SearchMenu.searchBoxCreate(this, this.viewportDiv,
                    this.cmdTree, true, cmdParser);
                break;
            }
            case CharacterCodes.L:
                this.setList();
                break;
            case CharacterCodes.B: {
                this.toggleBold();
                break;
            }
            case CharacterCodes.I: {
                this.toggleItalic();
                break;
            }
            case CharacterCodes.U: {
                this.toggleUnderline();
                break;
            }
            case CharacterCodes.D:
                this.setList(1);
                break;
            case CharacterCodes.G:
                this.viewTileProps();
                this.localQueueRender(this.cursor.pos);
                break;
            case CharacterCodes.S:
                this.collabDocument.save();
                break;
            case CharacterCodes.Y:
                this.undoRedoManager.redo();
                break;
            case CharacterCodes.Z:
                this.undoRedoManager.undo();
                break;
            case CharacterCodes.S4:
                this.enterMathMode();
                break;
            default:
                console.log(`got command key ${String.fromCharCode(charCode)} code: ${charCode}`);
                break;
        }
    }

    public testWordInfo() {
        const text = this.sharedString.getText();
        const nonWhitespace = text.split(/\s+/g);
        console.log(`non ws count: ${nonWhitespace.length}`);
        const obj = new Object();
        for (const nws of nonWhitespace) {
            if (!obj[nws]) {
                obj[nws] = 1;
            } else {
                obj[nws]++;
            }
        }
        let count = 0;
        const uniques = [] as string[];
        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                count++;
                uniques.push(key);
            }
        }
        console.log(`${count} unique`);
        const clock = Date.now();
        domutils.getMultiTextWidth(uniques, "18px Times");
        console.log(`unique pp cost: ${Date.now() - clock}ms`);
    }

    public preScroll() {
        if (this.lastVerticalX === -1) {
            const rect = this.cursor.rect();
            this.lastVerticalX = rect.left;
        }
    }

    public apresScroll(up: boolean) {
        if ((this.cursor.pos < this.viewportStartPos) ||
            (this.cursor.pos >= this.viewportEndPos)) {
            const x = this.getCanonicalX();
            if (up) {
                this.setCursorPosFromPixels(this.firstLineDiv(), x);
            } else {
                this.setCursorPosFromPixels(this.lastLineDiv(), x);
            }
            this.broadcastPresence();
            this.cursor.updateView(this);
        }
    }

    public scroll(up: boolean, one = false) {
        let scrollTo = this.topChar;
        if (one) {
            if (up) {
                const firstLineDiv = this.firstLineDiv();
                scrollTo = firstLineDiv.linePos - 2;
                if (scrollTo < 0) {
                    return;
                }
            } else {
                const nextFirstLineDiv = this.firstLineDiv().nextElementSibling as ILineDiv;
                if (nextFirstLineDiv) {
                    scrollTo = nextFirstLineDiv.linePos;
                } else {
                    return;
                }
            }
        } else {
            const len = this.client.getLength();
            const halfport = Math.floor(this.viewportCharCount() / 2);
            if ((up && (this.topChar === 0)) || ((!up) && (this.topChar > (len - halfport)))) {
                return;
            }
            if (up) {
                scrollTo -= halfport;
            } else {
                scrollTo += halfport;
            }
            if (scrollTo >= len) {
                scrollTo = len - 1;
            }
        }
        this.preScroll();
        this.render(scrollTo);
        this.apresScroll(up);
    }

    public render(topChar?: number, changed = false) {
        const len = this.client.getLength();
        if (len === 0) {
            return;
        }
        if (topChar !== undefined) {
            if (((this.topChar === topChar) || ((this.topChar === -1) && (topChar < 0)))
                && (!changed)) {
                return;
            }
            this.topChar = topChar;
            if (this.topChar < 0) {
                this.topChar = 0;
            }
            if (this.topChar >= len) {
                this.topChar = len - (this.viewportCharCount() / 2);
            }
        }

        const clk = Date.now();
        // TODO: consider using markers for presence info once splice segments during pg render
        this.updatePresencePositions();
        domutils.clearSubtree(this.viewportDiv);
        // this.viewportDiv.appendChild(this.cursor.editSpan);
        const renderOutput = renderTree(this.viewportDiv, this.topChar, this, this.targetTranslation);
        this.viewportStartPos = renderOutput.viewportStartPos;
        this.viewportEndPos = renderOutput.viewportEndPos;

        if (this.diagCharPort || true) {
            this.statusMessage("render", `&nbsp ${Date.now() - clk}ms`);
        }
        if (this.diagCharPort) {
            this.statusMessage("diagCharPort",
                `&nbsp sp: (${this.topChar}) ep: ${this.viewportEndPos} cp: ${this.cursor.pos}`);
        }

        this.emit("render", {
            overlayMarkers: renderOutput.overlayMarkers,
            range: { min: 1, max: this.client.getLength(), value: this.viewportStartPos },
            viewportEndPos: this.viewportEndPos,
            viewportStartPos: this.viewportStartPos,
        });
    }

    public async loadFinished(clockStart = 0) {
        // Work around a race condition with multiple shared strings trying to create the interval
        // collections at the same time
        if (this.collabDocument.existing) {
            const intervalCollections = this.sharedString.getIntervalCollections();
            await Promise.all([intervalCollections.wait("bookmarks"), intervalCollections.wait("comments")]);
        }

        const bookmarksCollection = this.sharedString.getSharedIntervalCollection("bookmarks");
        this.bookmarks = await bookmarksCollection.getView();

        // Takes a shared Object from OnPrepareDeserialize and inserts back into the interval's "Story" Property
        const onDeserialize: Sequence.DeserializeCallback = (interval, commentSharedString: ISharedObject) => {
            if (interval.properties && interval.properties["story"]) {
                assert(commentSharedString);
                interval.properties["story"] = commentSharedString;
            }

            return true;
        };

        // Fetches the shared object with the key story["value"];
        const onPrepareDeserialize: Sequence.PrepareDeserializeCallback = (properties) => {
            if (properties && properties["story"]) {
                const story = properties["story"];
                return this.collabDocument.get(story["value"]);
            } else {
                return Promise.resolve(null);
            }
        };

        // For examples of showing the API we do interval adds on the collection with comments. But use
        // the view when doing bookmarks.
        this.comments = this.sharedString.getSharedIntervalCollection("comments");
        this.commentsView = await this.comments.getView(onDeserialize, onPrepareDeserialize);

        this.sequenceTest = this.docRoot.get("sequence-test") as Sequence.SharedNumberSequence;
        this.sequenceTest.on("op", (op) => {
            this.showSequenceEntries();
        });
        this.render(0, true);
        if (clockStart > 0) {
            // tslint:disable-next-line:max-line-length
            console.log(`time to edit/impression: ${this.timeToEdit} time to load: ${Date.now() - clockStart}ms len: ${this.sharedString.client.getLength()} - ${performanceNow()}`);
        }
        this.presenceSignal = new PresenceSignal(this.collabDocument.runtime);
        this.addPresenceSignal(this.presenceSignal);
        this.addCalendarMap();
        const intervalMap = this.sharedString.intervalCollections;
        intervalMap.on("valueChanged", (delta: types.IValueChanged) => {
            this.queueRender(undefined, true);
        });
        // this.testWordInfo();
    }

    public updateTableInfo(changePos: number) {
        const stack =
            this.sharedString.client.mergeTree.getStackContext(changePos,
                this.sharedString.client.getClientId(), ["table"]);
        if (stack.table && (!stack.table.empty())) {
            const tableMarker = stack.table.top() as Table.ITableMarker;
            tableMarker.table = undefined;
        }
    }

    public updatePGInfo(changePos: number) {
        const tileInfo = findTile(this, changePos, "pg", false);
        if (tileInfo) {
            const tile = tileInfo.tile as Paragraph.IParagraphMarker;
            Paragraph.clearContentCaches(tile);
        } else {
            console.log("did not find pg to clear");
        }
        if (this.modifiedMarkers.length > 0) {
            this.updateTableInfo(changePos);
        }
    }

    public localQueueRender(updatePos: number) {
        if (this.parentFlow) {
            this.parentFlow.localQueueRender(updatePos);
        } else {
            if (updatePos >= 0) {
                this.updatePGInfo(updatePos);
            }
            if (!this.pendingRender) {
                this.pendingRender = true;
                window.requestAnimationFrame(() => {
                    this.pendingRender = false;
                    this.render(this.topChar, true);
                });
            }
        }
    }

    public setViewOption(options: Object) {
        viewOptions = options;
    }

    protected resizeCore(bounds: ui.Rectangle) {
        this.viewportRect = bounds.inner(0.92);
        if (this.viewportRect.height >= 0) {
            ui.Rectangle.conformElementToRect(this.viewportDiv, this.viewportRect);
            if (this.client.getLength() > 0) {
                this.render(this.topChar, true);
            }
            if (this.viewportDiv.style.backgroundSize !== undefined) {
                const rect = this.viewportDiv.getBoundingClientRect();
                this.viewportDiv.style.backgroundSize = `${rect.width}px ${rect.height}px`;
            }
        }
    }

    private insertParagraph(pos: number) {
        const curTilePos = findTile(this, pos, "pg", false);
        const pgMarker = curTilePos.tile as Paragraph.IParagraphMarker;
        const pgPos = curTilePos.pos;
        Paragraph.clearContentCaches(pgMarker);
        const curProps = pgMarker.properties;
        const newProps = MergeTree.createMap<any>();
        const newLabels = ["pg"];

        // TODO: Should merge w/all existing tile labels?
        if (Paragraph.isListTile(pgMarker)) {
            newLabels.push("list");
            newProps.indentLevel = curProps.indentLevel;
            newProps.listKind = curProps.listKind;
        }

        newProps[MergeTree.reservedTileLabelsKey] = newLabels;
        if (this.srcLanguage !== "en") {
            newProps["fromLanguage"] = this.srcLanguage;
        }
        // TODO: place in group op
        // old marker gets new props
        this.sharedString.annotateRange(newProps, pgPos, pgPos + 1, { name: "rewrite" });
        // new marker gets existing props
        this.sharedString.insertMarker(pos, MergeTree.ReferenceType.Tile, curProps);
        this.undoRedoManager.closeCurrentOperation();
    }

    private insertComponent(type: string, state: {}) {
        // TODO: All markers should be inserted as an atomic group.
        const component = ui.refTypeNameToComponent.get(type);
        if (isBlock(component)) {
            this.insertParagraph(this.cursor.pos++);
        }

        const props = {
            [Paragraph.referenceProperty]: {
                referenceDocId: "",                        // 'referenceDocId' not used
                type: {
                    name: type,
                } as IReferenceDocType,
                url: "",                        // 'url' not used
            } as IReferenceDoc,
            state,
        };

        this.sharedString.insertMarker(this.cursor.pos++, MergeTree.ReferenceType.Simple, props);
    }

    private remotePresenceUpdate(message: IInboundSignalMessage, local: boolean) {
        if (local) {
            return;
        }

        const remotePresenceBase = message.content as IRemotePresenceBase;

        if (remotePresenceBase.type === "selection") {
            this.remotePresenceToLocal(message.clientId, remotePresenceBase as IRemotePresenceInfo);
        } else if (remotePresenceBase.type === "drag") {
            this.remoteDragToLocal(remotePresenceBase as IRemoteDragInfo);
        }
    }

    private remotePresenceFromEdit(
        longClientId: string,
        refseq: number,
        oldpos: number,
        posAdjust = 0) {

        const remotePosInfo: IRemotePresenceInfo = {
            origMark: -1,
            origPos: oldpos + posAdjust,
            refseq,
            type: "selection",
        };

        this.remotePresenceToLocal(longClientId, remotePosInfo);
    }
    // TODO: throttle this if local starts moving
    private remoteDragToLocal(remoteDragInfo: IRemoteDragInfo) {
        this.movingInclusion.exclu = remoteDragInfo.exclu;
        this.movingInclusion.marker = <MergeTree.Marker>getContainingSegment(this, remoteDragInfo.markerPos).segment;
        this.movingInclusion.dx = remoteDragInfo.dx;
        this.movingInclusion.dy = remoteDragInfo.dy;
        this.movingInclusion.onTheMove = remoteDragInfo.onTheMove;
        this.localQueueRender(Nope);
    }

    private remotePresenceToLocal(longClientId: string, remotePresenceInfo: IRemotePresenceInfo, posAdjust = 0) {
        const clientId = this.client.getOrAddShortClientId(longClientId);

        let segoff = this.client.mergeTree.getContainingSegment(remotePresenceInfo.origPos,
            remotePresenceInfo.refseq, clientId);

        if (segoff.segment === undefined) {
            if (remotePresenceInfo.origPos === this.client.getLength()) {
                segoff = this.client.mergeTree.getContainingSegment(remotePresenceInfo.origPos - 1,
                    remotePresenceInfo.refseq, clientId);
                if (segoff.segment) {
                    segoff.offset++;
                }
            }
        }

        if (segoff.segment) {
            const docClient = this.collabDocument.getClient(longClientId);
            if (docClient && docClient.client.type === "browser") {
                const localPresenceInfo = {
                    clientId,
                    fresh: true,
                    localRef: new MergeTree.LocalReference(segoff.segment as MergeTree.BaseSegment, segoff.offset,
                        MergeTree.ReferenceType.SlideOnRemove),
                    shouldShowCursor: () => {
                        return this.client.getClientId() !== clientId &&
                            Array.from(this.collabDocument.getClients().keys())
                                .map((k) => this.client.getOrAddShortClientId(k))
                                .indexOf(clientId) !== -1;
                    },
                    user: docClient.client.user,
                } as ILocalPresenceInfo;
                if (remotePresenceInfo.origMark >= 0) {
                    const markSegoff = this.client.mergeTree.getContainingSegment(remotePresenceInfo.origMark,
                        remotePresenceInfo.refseq, clientId);
                    if (markSegoff.segment) {
                        localPresenceInfo.markLocalRef =
                            new MergeTree.LocalReference(markSegoff.segment as MergeTree.BaseSegment,
                                markSegoff.offset, MergeTree.ReferenceType.SlideOnRemove);
                    }
                }
                this.updatePresenceVector(localPresenceInfo);
            }
        }
    }

    private broadcastPresence() {
        if (this.presenceSignal && this.collabDocument.isConnected) {
            const presenceInfo: IRemotePresenceInfo = {
                origMark: this.cursor.mark,
                origPos: this.cursor.pos,
                refseq: this.client.getCurrentSeq(),
                type: "selection",
            };
            this.presenceSignal.submitPresence(presenceInfo);
        }
    }

    private broadcastDragPresence() {
        if (this.presenceSignal && this.collabDocument.isConnected) {
            let dragPresenceInfo: IRemoteDragInfo;
            dragPresenceInfo = {
                dx: this.movingInclusion.dx,
                dy: this.movingInclusion.dy,
                exclu: this.movingInclusion.exclu,
                markerPos: getOffset(this, this.movingInclusion.marker),
                onTheMove: this.movingInclusion.onTheMove,
                type: "drag",
            };
            this.presenceSignal.submitPresence(dragPresenceInfo);
        }
    }

    private increaseIndent(tile: Paragraph.IParagraphMarker, pos: number, decrease = false) {
        tile.listCache = undefined;
        this.undoRedoManager.closeCurrentOperation();
        if (decrease && tile.properties.indentLevel > 0) {
            this.sharedString.annotateRange({ indentLevel: -1 },
                pos, pos + 1, { name: "incr", defaultValue: 1, minValue: 0 });
        } else if (!decrease) {
            this.sharedString.annotateRange({ indentLevel: 1 }, pos, pos + 1,
                { name: "incr", defaultValue: 0 });
        }
        this.undoRedoManager.closeCurrentOperation();
    }

    private handleSharedStringDelta(event: Sequence.SequenceDeltaEvent, target: Sequence.SharedString) {
        let opCursorPos: number;
        event.ranges.forEach((range) => {
            if (MergeTree.Marker.is(range.segment)) {
                const marker = range.segment as MergeTree.Marker;
                this.updatePGInfo(range.offset - 1);
            } else if (MergeTree.TextSegment.is(range.segment)) {
                if (range.operation === MergeTree.MergeTreeDeltaType.REMOVE) {
                    opCursorPos = range.offset;
                } else {
                    const insertOrAnnotateEnd = range.offset + range.segment.cachedLength;
                    this.updatePGInfo(insertOrAnnotateEnd);
                    if (range.operation === MergeTree.MergeTreeDeltaType.INSERT) {
                        opCursorPos = insertOrAnnotateEnd;
                    }
                }
            }
            // if it was a remote op before the local cursor, we need to adjust
            // the local cursor
            if (!event.isLocal && range.offset <= this.cursor.pos) {
                let adjust = range.segment.cachedLength;
                // we might not need to use the full length if
                // the range crosses the curors position
                if (range.offset + adjust > this.cursor.pos) {
                    adjust -= range.offset + adjust - this.cursor.pos;
                }

                // do nothing for annotate, as it doesn't affect position
                if (range.operation === MergeTree.MergeTreeDeltaType.REMOVE) {
                    this.cursor.pos -= adjust;
                } else if (range.operation === MergeTree.MergeTreeDeltaType.INSERT) {
                    this.cursor.pos += adjust;
                }
            }
        });

        if (event.isLocal) {
            if (opCursorPos !== undefined) {
                this.cursor.pos = opCursorPos;
                const mathTileInfo = this.inMathGetMarker();
                if (mathTileInfo) {
                    const mathMarker = mathTileInfo.tile as MathMenu.IMathMarker;
                    if (event.deltaOperation === MergeTree.MergeTreeDeltaType.INSERT) {
                        this.mathMarkerPostInsert(mathMarker, mathTileInfo.pos);
                    } else if (event.deltaOperation === MergeTree.MergeTreeDeltaType.REMOVE) {
                        // assume single range from backspace for now
                        this.mathMarkerPostRemove(mathMarker, mathTileInfo.pos);
                    }
                }

            }
            this.localQueueRender(this.cursor.pos);
        } else {
            if (opCursorPos !== undefined) {
                this.remotePresenceFromEdit(
                    event.opArgs.sequencedMessage.clientId,
                    event.opArgs.sequencedMessage.referenceSequenceNumber,
                    opCursorPos);
            }
            this.queueRender(undefined, this.posInViewport(event.start) || this.posInViewport(opCursorPos));
        }
    }

    private posInViewport(pos: number) {
        return ((this.viewportEndPos > pos) && (pos >= this.viewportStartPos));
    }

    private presenceQueueRender(localPresenceInfo: ILocalPresenceInfo, sameLine = false) {
        if ((!this.pendingRender) &&
            (this.posInViewport(localPresenceInfo.xformPos) ||
                (this.posInViewport(localPresenceInfo.markXformPos)))) {
            if (!sameLine) {
                this.pendingRender = true;
                window.requestAnimationFrame(() => {
                    this.pendingRender = false;
                    this.render(this.topChar, true);
                });
            } else {
                reRenderLine(localPresenceInfo.cursor.lineDiv(), this, this.lastDocContext);
            }
        }
    }

    private queueRender(msg: ISequencedDocumentMessage, go = false) {
        if ((!this.pendingRender) && (go || (msg && msg.contents))) {
            this.pendingRender = true;
            window.requestAnimationFrame(() => {
                this.pendingRender = false;
                this.render(this.topChar, true);
            });
        }
    }
}
