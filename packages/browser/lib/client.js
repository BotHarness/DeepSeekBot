window.__ModuleLoader__.load({
	id: "@botharness/browser",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		//#region \0rolldown/runtime.js
		var __create = Object.create;
		var __defProp = Object.defineProperty;
		var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
		var __getOwnPropNames = Object.getOwnPropertyNames;
		var __getProtoOf = Object.getPrototypeOf;
		var __hasOwnProp = Object.prototype.hasOwnProperty;
		var __commonJSMin = (cb, mod) => () => (mod || (cb((mod = { exports: {} }).exports, mod), cb = null), mod.exports);
		var __copyProps = (to, from, except, desc) => {
			if (from && typeof from === "object" || typeof from === "function") for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
				key = keys[i];
				if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
					get: ((k) => from[k]).bind(null, key),
					enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
				});
			}
			return to;
		};
		var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule || !__hasOwnProp.call(mod, "default") ? __defProp(target, "default", {
			value: mod,
			enumerable: true
		}) : target, mod));
		//#endregion
		let react = require("react");
		react = __toESM(react, 1);
		let react_jsx_runtime = require("react/jsx-runtime");
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		_deepseek_ai_dsh_client_ui_primitives = __toESM(_deepseek_ai_dsh_client_ui_primitives, 1);
		let react_dom = require("react-dom");
		react_dom = __toESM(react_dom, 1);
		//#region packages/client/src/client/visible-interval.ts
		function visibleInterval(run, ms, page = typeof document === "undefined" ? void 0 : document) {
			let timer;
			let hidden = page?.visibilityState === "hidden";
			const start = () => {
				clearInterval(timer);
				timer = hidden ? void 0 : setInterval(run, ms);
			};
			const changed = () => {
				const next = page?.visibilityState === "hidden";
				if (next === hidden) return;
				hidden = next;
				if (!hidden) run();
				start();
			};
			page?.addEventListener?.("visibilitychange", changed);
			start();
			return () => {
				clearInterval(timer);
				page?.removeEventListener?.("visibilitychange", changed);
			};
		}
		//#endregion
		//#region packages/client/src/client/channel-sidebar-icon.tsx
		/**
		* Vendored Channel sidebar glyphs from lucide-react@1.46.0 (ISC, ADR-0032).
		*
		* Source: the matching lucide `dist/esm/icons/*.mjs` glyph data. Vendored at the
		* stock 2-unit stroke without adding a `lucide-react` runtime dependency.
		*
		* ISC License
		*
		* Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2022 as part of Feather (MIT).
		* All other copyright (c) for Lucide are held by Lucide Contributors 2022.
		*
		* Permission to use, copy, modify, and/or distribute this software for any
		* purpose with or without fee is hereby granted, provided that the above
		* copyright notice and this permission notice appear in all copies.
		*
		* THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
		* REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
		* AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
		* INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
		* LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
		* OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
		* PERFORMANCE OF THIS SOFTWARE.
		*/
		const glyphs = {
			ellipsis: [
				["circle", {
					cx: "12",
					cy: "12",
					r: "1"
				}],
				["circle", {
					cx: "19",
					cy: "12",
					r: "1"
				}],
				["circle", {
					cx: "5",
					cy: "12",
					r: "1"
				}]
			],
			"circle-x": [
				["circle", {
					cx: "12",
					cy: "12",
					r: "10"
				}],
				["path", { d: "m15 9-6 6" }],
				["path", { d: "m9 9 6 6" }]
			],
			"arrow-up": [["path", { d: "m5 12 7-7 7 7" }], ["path", { d: "M12 19V5" }]],
			"arrow-up-right": [["path", { d: "M7 7h10v10" }], ["path", { d: "M7 17 17 7" }]],
			download: [
				["path", { d: "M12 15V3" }],
				["path", { d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" }],
				["path", { d: "m7 10 5 5 5-5" }]
			],
			save: [
				["path", { d: "M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" }],
				["path", { d: "M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7" }],
				["path", { d: "M7 3v4a1 1 0 0 0 1 1h7" }]
			],
			"triangle-alert": [
				["path", { d: "m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" }],
				["path", { d: "M12 9v4" }],
				["path", { d: "M12 17h.01" }]
			],
			"message-square-plus": [
				["path", { d: "M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z" }],
				["path", { d: "M12 8v6" }],
				["path", { d: "M9 11h6" }]
			],
			"panel-left": [["rect", {
				width: "18",
				height: "18",
				x: "3",
				y: "3",
				rx: "2"
			}], ["path", { d: "M9 3v18" }]],
			pencil: [["path", { d: "M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" }], ["path", { d: "m15 5 4 4" }]],
			"folder-open": [["path", { d: "m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2" }]],
			pin: [["path", { d: "M12 17v5" }], ["path", { d: "M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z" }]],
			share: [
				["path", { d: "M12 2v13" }],
				["path", { d: "m16 6-4-4-4 4" }],
				["path", { d: "M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" }]
			],
			"chevron-left": [["path", { d: "m15 18-6-6 6-6" }]],
			"circle-check": [["circle", {
				cx: "12",
				cy: "12",
				r: "10"
			}], ["path", { d: "m16 9-5.5 5.5L8 12" }]],
			maximize: [
				["path", { d: "M8 3H5a2 2 0 0 0-2 2v3" }],
				["path", { d: "M21 8V5a2 2 0 0 0-2-2h-3" }],
				["path", { d: "M3 16v3a2 2 0 0 0 2 2h3" }],
				["path", { d: "M16 21h3a2 2 0 0 0 2-2v-3" }]
			],
			link: [["path", { d: "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" }], ["path", { d: "M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" }]],
			paperclip: [["path", { d: "m16 6-8.414 8.586a2 2 0 0 0 2.829 2.829l8.414-8.586a4 4 0 1 0-5.657-5.657l-8.379 8.551a6 6 0 1 0 8.485 8.485l8.379-8.551" }]],
			shield: [["path", { d: "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" }]],
			"refresh-cw": [
				["path", { d: "M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" }],
				["path", { d: "M21 3v5h-5" }],
				["path", { d: "M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" }],
				["path", { d: "M8 16H3v5" }]
			],
			sparkles: [
				["path", { d: "M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z" }],
				["path", { d: "M20 2v4" }],
				["path", { d: "M22 4h-4" }],
				["circle", {
					cx: "4",
					cy: "20",
					r: "2"
				}]
			],
			clock: [["circle", {
				cx: "12",
				cy: "12",
				r: "10"
			}], ["path", { d: "M12 6v6l4 2" }]],
			folder: [["path", { d: "M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" }]],
			"wrap-text": [
				["path", { d: "m16 16-3 3 3 3" }],
				["path", { d: "M3 12h14.5a1 1 0 0 1 0 7H13" }],
				["path", { d: "M3 19h6" }],
				["path", { d: "M3 5h18" }]
			],
			list: [
				["path", { d: "M3 5h.01" }],
				["path", { d: "M3 12h.01" }],
				["path", { d: "M3 19h.01" }],
				["path", { d: "M8 5h13" }],
				["path", { d: "M8 12h13" }],
				["path", { d: "M8 19h13" }]
			],
			eraser: [["path", { d: "M21 21H8a2 2 0 0 1-1.42-.587l-3.994-3.999a2 2 0 0 1 0-2.828l10-10a2 2 0 0 1 2.829 0l5.999 6a2 2 0 0 1 0 2.828L12.834 21" }], ["path", { d: "m5.082 11.09 8.828 8.828" }]],
			"paint-bucket": [
				["path", { d: "M11 7 6 2" }],
				["path", { d: "M18.992 12H2.041" }],
				["path", { d: "M21.145 18.38A3.34 3.34 0 0 1 20 16.5a3.3 3.3 0 0 1-1.145 1.88c-.575.46-.855 1.02-.855 1.595A2 2 0 0 0 20 22a2 2 0 0 0 2-2.025c0-.58-.285-1.13-.855-1.595" }],
				["path", { d: "m8.5 4.5 2.148-2.148a1.205 1.205 0 0 1 1.704 0l7.296 7.296a1.205 1.205 0 0 1 0 1.704l-7.592 7.592a3.615 3.615 0 0 1-5.112 0l-3.888-3.888a3.615 3.615 0 0 1 0-5.112L5.67 7.33" }]
			],
			replace: [
				["path", { d: "M14 4a1 1 0 0 1 1-1" }],
				["path", { d: "M15 10a1 1 0 0 1-1-1" }],
				["path", { d: "M21 4a1 1 0 0 0-1-1" }],
				["path", { d: "M21 9a1 1 0 0 1-1 1" }],
				["path", { d: "m3 7 3 3 3-3" }],
				["path", { d: "M6 10V5a2 2 0 0 1 2-2h2" }],
				["rect", {
					x: "3",
					y: "14",
					width: "7",
					height: "7",
					rx: "1"
				}]
			],
			slash: [["path", { d: "M22 2 2 22" }]],
			square: [["rect", {
				width: "18",
				height: "18",
				x: "3",
				y: "3",
				rx: "2"
			}]],
			blend: [["circle", {
				cx: "15",
				cy: "9",
				r: "7"
			}], ["circle", {
				cx: "9",
				cy: "15",
				r: "7"
			}]],
			"spray-can": [
				["path", { d: "M3 3h.01" }],
				["path", { d: "M7 5h.01" }],
				["path", { d: "M11 7h.01" }],
				["path", { d: "M3 7h.01" }],
				["path", { d: "M7 9h.01" }],
				["path", { d: "M3 11h.01" }],
				["rect", {
					width: "4",
					height: "4",
					x: "15",
					y: "5"
				}],
				["path", { d: "m19 9 2 2v10c0 .6-.4 1-1 1h-6c-.6 0-1-.4-1-1V11l2-2" }],
				["path", { d: "m13 14 8-2" }],
				["path", { d: "m13 19 8-2" }]
			],
			pipette: [
				["path", { d: "m12 9-8.414 8.414A2 2 0 0 0 3 18.828v1.344a2 2 0 0 1-.586 1.414A2 2 0 0 1 3.828 21h1.344a2 2 0 0 0 1.414-.586L15 12" }],
				["path", { d: "m18 9 .4.4a1 1 0 1 1-3 3l-3.8-3.8a1 1 0 1 1 3-3l.4.4 3.4-3.4a1 1 0 1 1 3 3z" }],
				["path", { d: "m2 22 .414-.414" }]
			],
			"triangles-centerline-dashed-horizontal": [
				["path", { d: "M10 12H8" }],
				["path", { d: "M16 12h-2" }],
				["path", { d: "M22 12h-2" }],
				["path", { d: "M4 12H2" }],
				["path", { d: "M7.298 20.288A1 1 0 008 22h8a1 1 0 00.703-1.712l-3.991-3.99a1 1 0 00-1.424-.001z" }],
				["path", { d: "M7.298 3.712A1 1 0 018 2h8a1 1 0 01.703 1.712l-3.991 3.99a1 1 0 01-1.424.001z" }]
			],
			"undo-2": [["path", { d: "M9 14 4 9l5-5" }], ["path", { d: "M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11" }]],
			"redo-2": [["path", { d: "m15 14 5-5-5-5" }], ["path", { d: "M20 9H9.5A5.5 5.5 0 0 0 4 14.5A5.5 5.5 0 0 0 9.5 20H13" }]],
			"zoom-in": [
				["circle", {
					cx: "11",
					cy: "11",
					r: "8"
				}],
				["line", {
					x1: "21",
					x2: "16.65",
					y1: "21",
					y2: "16.65"
				}],
				["line", {
					x1: "11",
					x2: "11",
					y1: "8",
					y2: "14"
				}],
				["line", {
					x1: "8",
					x2: "14",
					y1: "11",
					y2: "11"
				}]
			],
			"zoom-out": [
				["circle", {
					cx: "11",
					cy: "11",
					r: "8"
				}],
				["line", {
					x1: "21",
					x2: "16.65",
					y1: "21",
					y2: "16.65"
				}],
				["line", {
					x1: "8",
					x2: "14",
					y1: "11",
					y2: "11"
				}]
			],
			move: [
				["path", { d: "M12 2v20" }],
				["path", { d: "m15 19-3 3-3-3" }],
				["path", { d: "m19 9 3 3-3 3" }],
				["path", { d: "M2 12h20" }],
				["path", { d: "m5 9-3 3 3 3" }],
				["path", { d: "m9 5 3-3 3 3" }]
			],
			"layers-2": [["path", { d: "M13 13.74a2 2 0 0 1-2 0L2.5 8.87a1 1 0 0 1 0-1.74L11 2.26a2 2 0 0 1 2 0l8.5 4.87a1 1 0 0 1 0 1.74z" }], ["path", { d: "m20 14.285 1.5.845a1 1 0 0 1 0 1.74L13 21.74a2 2 0 0 1-2 0l-8.5-4.87a1 1 0 0 1 0-1.74l1.5-.845" }]],
			image: [
				["rect", {
					width: "18",
					height: "18",
					x: "3",
					y: "3",
					rx: "2",
					ry: "2"
				}],
				["circle", {
					cx: "9",
					cy: "9",
					r: "2"
				}],
				["path", { d: "m21 15-4-4L7 21" }]
			],
			"arrow-left": [["path", { d: "m12 19-7-7 7-7" }], ["path", { d: "M19 12H5" }]],
			"chevron-right": [["path", { d: "m9 18 6-6-6-6" }]],
			"chevron-up": [["path", { d: "m18 15-6-6-6 6" }]],
			"chevron-down": [["path", { d: "m6 9 6 6 6-6" }]],
			store: [
				["path", { d: "M15 21v-5a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v5" }],
				["path", { d: "M17.774 10.31a1.12 1.12 0 0 0-1.549 0 2.5 2.5 0 0 1-3.451 0 1.12 1.12 0 0 0-1.548 0 2.5 2.5 0 0 1-3.452 0 1.12 1.12 0 0 0-1.549 0 2.5 2.5 0 0 1-3.77-3.248l2.889-4.184A2 2 0 0 1 7 2h10a2 2 0 0 1 1.653.873l2.895 4.192a2.5 2.5 0 0 1-3.774 3.244" }],
				["path", { d: "M4 10.95V19a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8.05" }]
			],
			house: [["path", { d: "m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z" }]],
			search: [["path", { d: "m21 21-4.34-4.34" }], ["circle", {
				cx: "11",
				cy: "11",
				r: "8"
			}]],
			hash: [
				["line", {
					x1: "4",
					x2: "20",
					y1: "9",
					y2: "9"
				}],
				["line", {
					x1: "4",
					x2: "20",
					y1: "15",
					y2: "15"
				}],
				["line", {
					x1: "10",
					x2: "8",
					y1: "3",
					y2: "21"
				}],
				["line", {
					x1: "16",
					x2: "14",
					y1: "3",
					y2: "21"
				}]
			],
			"messages-circle": [["path", { d: "M19.95 10.05a7 7 0 011.412 7.872 1 1 0 00-.058.787l.675 2.089a1 1 0 01-1.236 1.168l-2.155-.631a1 1 0 00-.745.06 7 7 0 01-7.793-1.445" }], ["path", { d: "M2.696 12.708a1 1 0 00-.058-.785 7 7 0 113.518 3.473 1 1 0 00-.744-.061l-2.155.63a1 1 0 01-1.236-1.167z" }]],
			"text-quote": [
				["path", { d: "M17 5H3" }],
				["path", { d: "M21 12H8" }],
				["path", { d: "M21 19H8" }],
				["path", { d: "M3 12v7" }]
			],
			brain: [
				["path", { d: "M12 18V5" }],
				["path", { d: "M15 13a4.17 4.17 0 0 1-3-4 4.17 4.17 0 0 1-3 4" }],
				["path", { d: "M17.598 6.5A3 3 0 1 0 12 5a3 3 0 1 0-5.598 1.5" }],
				["path", { d: "M17.997 5.125a4 4 0 0 1 2.526 5.77" }],
				["path", { d: "M18 18a4 4 0 0 0 2-7.464" }],
				["path", { d: "M19.967 17.483A4 4 0 1 1 12 18a4 4 0 1 1-7.967-.517" }],
				["path", { d: "M6 18a4 4 0 0 1-2-7.464" }],
				["path", { d: "M6.003 5.125a4 4 0 0 0-2.526 5.77" }]
			],
			file: [["path", { d: "M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z" }], ["path", { d: "M14 2v5a1 1 0 0 0 1 1h5" }]],
			terminal: [["path", { d: "M12 19h8" }], ["path", { d: "m4 17 6-6-6-6" }]],
			archive: [
				["rect", {
					width: "20",
					height: "5",
					x: "2",
					y: "3",
					rx: "1"
				}],
				["path", { d: "M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" }],
				["path", { d: "M10 12h4" }]
			],
			"archive-restore": [
				["rect", {
					width: "20",
					height: "5",
					x: "2",
					y: "3",
					rx: "1"
				}],
				["path", { d: "M4 8v11a2 2 0 0 0 2 2h2" }],
				["path", { d: "M20 8v11a2 2 0 0 1-2 2h-2" }],
				["path", { d: "m9 15 3-3 3 3" }],
				["path", { d: "M12 12v9" }]
			],
			"alarm-clock": [
				["circle", {
					cx: "12",
					cy: "13",
					r: "8"
				}],
				["path", { d: "M12 9v4l2 2" }],
				["path", { d: "M5 3 2 6" }],
				["path", { d: "m22 6-3-3" }],
				["path", { d: "M6.38 18.7 4 21" }],
				["path", { d: "M17.64 18.67 20 21" }]
			],
			"bell-ring": [
				["path", { d: "M10.268 21a2 2 0 0 0 3.464 0" }],
				["path", { d: "M22 8c0-2.3-.8-4.3-2-6" }],
				["path", { d: "M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326" }],
				["path", { d: "M4 2C2.8 3.7 2 5.7 2 8" }]
			],
			bell: [["path", { d: "M10.268 21a2 2 0 0 0 3.464 0" }], ["path", { d: "M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326" }]],
			"bell-off": [
				["path", { d: "M10.268 21a2 2 0 0 0 3.464 0" }],
				["path", { d: "M17 17H4a1 1 0 0 1-.74-1.673C4.59 13.956 6 12.499 6 8a6 6 0 0 1 .258-1.742" }],
				["path", { d: "m2 2 20 20" }],
				["path", { d: "M8.668 3.01A6 6 0 0 1 18 8c0 2.687.77 4.653 1.707 6.05" }]
			],
			cpu: [
				["path", { d: "M12 20v2" }],
				["path", { d: "M12 2v2" }],
				["path", { d: "M17 20v2" }],
				["path", { d: "M17 2v2" }],
				["path", { d: "M2 12h2" }],
				["path", { d: "M2 17h2" }],
				["path", { d: "M2 7h2" }],
				["path", { d: "M20 12h2" }],
				["path", { d: "M20 17h2" }],
				["path", { d: "M20 7h2" }],
				["path", { d: "M7 20v2" }],
				["path", { d: "M7 2v2" }],
				["rect", {
					x: "4",
					y: "4",
					width: "16",
					height: "16",
					rx: "2"
				}],
				["rect", {
					x: "8",
					y: "8",
					width: "8",
					height: "8",
					rx: "1"
				}]
			],
			"id-card": [
				["path", { d: "M13 19a4 4 0 00-8 0" }],
				["path", { d: "M16 10h2" }],
				["path", { d: "M16 14h2" }],
				["circle", {
					cx: "9",
					cy: "12",
					r: "3"
				}],
				["rect", {
					x: "2",
					y: "5",
					width: "20",
					height: "14",
					rx: "2"
				}]
			],
			plug: [
				["path", { d: "M12 22v-5" }],
				["path", { d: "M15 8V2" }],
				["path", { d: "M17 8a1 1 0 0 1 1 1v4a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1z" }],
				["path", { d: "M9 8V2" }]
			],
			ruler: [
				["path", { d: "M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.41 2.41 0 0 1 0-3.4l2.6-2.6a2.41 2.41 0 0 1 3.4 0Z" }],
				["path", { d: "m14.5 12.5 2-2" }],
				["path", { d: "m11.5 9.5 2-2" }],
				["path", { d: "m8.5 6.5 2-2" }],
				["path", { d: "m17.5 15.5 2-2" }]
			],
			compass: [["circle", {
				cx: "12",
				cy: "12",
				r: "10"
			}], ["path", { d: "m16.24 7.76-1.804 5.411a2 2 0 0 1-1.265 1.265L7.76 16.24l1.804-5.411a2 2 0 0 1 1.265-1.265z" }]],
			gauge: [["path", { d: "m12 14 4-4" }], ["path", { d: "M3.34 19a10 10 0 1 1 17.32 0" }]],
			"user-check": [
				["path", { d: "m16 11 2 2 4-4" }],
				["path", { d: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" }],
				["circle", {
					cx: "9",
					cy: "7",
					r: "4"
				}]
			],
			"shield-check": [["path", { d: "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" }], ["path", { d: "m9 12 2 2 4-4" }]],
			upload: [
				["path", { d: "M12 3v12" }],
				["path", { d: "m17 8-5-5-5 5" }],
				["path", { d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" }]
			],
			package: [
				["path", { d: "M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z" }],
				["path", { d: "M12 22V12" }],
				["path", { d: "M3.29 7 12 12l8.71-5" }],
				["path", { d: "m7.5 4.27 9 5.15" }]
			],
			plus: [["path", { d: "M5 12h14" }], ["path", { d: "M12 5v14" }]],
			user: [["path", { d: "M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" }], ["circle", {
				cx: "12",
				cy: "7",
				r: "4"
			}]],
			"user-plus": [
				["path", { d: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" }],
				["circle", {
					cx: "9",
					cy: "7",
					r: "4"
				}],
				["path", { d: "M19 8v6" }],
				["path", { d: "M22 11h-6" }]
			],
			bot: [
				["path", { d: "M12 8V4H8" }],
				["rect", {
					width: "16",
					height: "12",
					x: "4",
					y: "8",
					rx: "2"
				}],
				["path", { d: "M2 14h2" }],
				["path", { d: "M20 14h2" }],
				["path", { d: "M15 13v2" }],
				["path", { d: "M9 13v2" }]
			],
			"list-checks": [
				["path", { d: "M13 5h8" }],
				["path", { d: "M13 12h8" }],
				["path", { d: "M13 19h8" }],
				["path", { d: "m3 17 2 2 4-4" }],
				["path", { d: "m3 7 2 2 4-4" }]
			],
			target: [
				["circle", {
					cx: "12",
					cy: "12",
					r: "10"
				}],
				["circle", {
					cx: "12",
					cy: "12",
					r: "6"
				}],
				["circle", {
					cx: "12",
					cy: "12",
					r: "2"
				}]
			],
			palette: [
				["path", { d: "M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z" }],
				["circle", {
					cx: "13.5",
					cy: "6.5",
					r: ".5",
					fill: "currentColor"
				}],
				["circle", {
					cx: "17.5",
					cy: "10.5",
					r: ".5",
					fill: "currentColor"
				}],
				["circle", {
					cx: "6.5",
					cy: "12.5",
					r: ".5",
					fill: "currentColor"
				}],
				["circle", {
					cx: "8.5",
					cy: "7.5",
					r: ".5",
					fill: "currentColor"
				}]
			],
			"image-up": [
				["path", { d: "M10.3 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10l-3.1-3.1a2 2 0 0 0-2.814.014L6 21" }],
				["path", { d: "m14 19.5 3-3 3 3" }],
				["path", { d: "M17 22v-5.5" }],
				["circle", {
					cx: "9",
					cy: "9",
					r: "2"
				}]
			],
			lock: [["rect", {
				width: "18",
				height: "11",
				x: "3",
				y: "11",
				rx: "2",
				ry: "2"
			}], ["path", { d: "M7 11V7a5 5 0 0 1 10 0v4" }]],
			play: [["path", { d: "M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z" }]],
			"lock-open": [["rect", {
				width: "18",
				height: "11",
				x: "3",
				y: "11",
				rx: "2",
				ry: "2"
			}], ["path", { d: "M7 11V7a5 5 0 0 1 9.9-1" }]],
			eye: [["path", { d: "M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" }], ["circle", {
				cx: "12",
				cy: "12",
				r: "3"
			}]],
			"eye-off": [
				["path", { d: "M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49" }],
				["path", { d: "M14.084 14.158a3 3 0 0 1-4.242-4.242" }],
				["path", { d: "M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143" }],
				["path", { d: "m2 2 20 20" }]
			],
			files: [
				["path", { d: "M15 2h-4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V8" }],
				["path", { d: "M16.706 2.706A2.4 2.4 0 0 0 15 2v5a1 1 0 0 0 1 1h5a2.4 2.4 0 0 0-.706-1.706z" }],
				["path", { d: "M5 7a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h8a2 2 0 0 0 1.732-1" }]
			],
			"git-branch": [
				["path", { d: "M15 6a9 9 0 0 0-9 9V3" }],
				["circle", {
					cx: "18",
					cy: "6",
					r: "3"
				}],
				["circle", {
					cx: "6",
					cy: "18",
					r: "3"
				}]
			],
			"messages-square": [["path", { d: "M16 10a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 14.286V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" }], ["path", { d: "M20 9a2 2 0 0 1 2 2v10.286a.71.71 0 0 1-1.212.502l-2.202-2.202A2 2 0 0 0 17.172 19H10a2 2 0 0 1-2-2v-1" }]],
			inbox: [["polyline", { points: "22 12 16 12 14 15 10 15 8 12 2 12" }], ["path", { d: "M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" }]],
			"folder-key": [
				["path", { d: "M13 20H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H20a2 2 0 0 1 2 2v1.36" }],
				["path", { d: "M19 12v6" }],
				["path", { d: "M19 14h2" }],
				["circle", {
					cx: "19",
					cy: "20",
					r: "2"
				}]
			],
			users: [
				["path", { d: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" }],
				["path", { d: "M16 3.128a4 4 0 0 1 0 7.744" }],
				["path", { d: "M22 21v-2a4 4 0 0 0-3-3.87" }],
				["circle", {
					cx: "9",
					cy: "7",
					r: "4"
				}]
			],
			"settings-2": [
				["path", { d: "M14 17H5" }],
				["path", { d: "M19 7h-9" }],
				["circle", {
					cx: "17",
					cy: "17",
					r: "3"
				}],
				["circle", {
					cx: "7",
					cy: "7",
					r: "3"
				}]
			],
			settings: [["path", { d: "M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915" }], ["circle", {
				cx: "12",
				cy: "12",
				r: "3"
			}]],
			monitor: [
				["rect", {
					width: "20",
					height: "14",
					x: "2",
					y: "3",
					rx: "2"
				}],
				["line", {
					x1: "8",
					x2: "16",
					y1: "21",
					y2: "21"
				}],
				["line", {
					x1: "12",
					x2: "12",
					y1: "17",
					y2: "21"
				}]
			],
			globe: [
				["circle", {
					cx: "12",
					cy: "12",
					r: "10"
				}],
				["path", { d: "M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" }],
				["path", { d: "M2 12h20" }]
			],
			"panel-right": [["rect", {
				width: "18",
				height: "18",
				x: "3",
				y: "3",
				rx: "2"
			}], ["path", { d: "M15 3v18" }]],
			"panels-top-left": [
				["rect", {
					width: "18",
					height: "18",
					x: "3",
					y: "3",
					rx: "2"
				}],
				["path", { d: "M3 9h18" }],
				["path", { d: "M9 21V9" }]
			],
			"grip-vertical": [
				["circle", {
					cx: "9",
					cy: "12",
					r: "1"
				}],
				["circle", {
					cx: "9",
					cy: "5",
					r: "1"
				}],
				["circle", {
					cx: "9",
					cy: "19",
					r: "1"
				}],
				["circle", {
					cx: "15",
					cy: "12",
					r: "1"
				}],
				["circle", {
					cx: "15",
					cy: "5",
					r: "1"
				}],
				["circle", {
					cx: "15",
					cy: "19",
					r: "1"
				}]
			],
			star: [["path", { d: "M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z" }]],
			copy: [["rect", {
				width: "14",
				height: "14",
				x: "8",
				y: "8",
				rx: "2",
				ry: "2"
			}], ["path", { d: "M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" }]],
			"ellipsis-vertical": [
				["circle", {
					cx: "12",
					cy: "12",
					r: "1"
				}],
				["circle", {
					cx: "12",
					cy: "5",
					r: "1"
				}],
				["circle", {
					cx: "12",
					cy: "19",
					r: "1"
				}]
			],
			"external-link": [
				["path", { d: "M15 3h6v6" }],
				["path", { d: "M10 14 21 3" }],
				["path", { d: "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" }]
			],
			sun: [
				["circle", {
					cx: "12",
					cy: "12",
					r: "4"
				}],
				["path", { d: "M12 2v2" }],
				["path", { d: "M12 20v2" }],
				["path", { d: "m4.93 4.93 1.41 1.41" }],
				["path", { d: "m17.66 17.66 1.41 1.41" }],
				["path", { d: "M2 12h2" }],
				["path", { d: "M20 12h2" }],
				["path", { d: "m6.34 17.66-1.41 1.41" }],
				["path", { d: "m19.07 4.93-1.41 1.41" }]
			],
			moon: [["path", { d: "M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401" }]],
			crop: [["path", { d: "M6 2v14a2 2 0 0 0 2 2h14" }], ["path", { d: "M18 22V8a2 2 0 0 0-2-2H2" }]],
			ban: [["circle", {
				cx: "12",
				cy: "12",
				r: "10"
			}], ["path", { d: "M4.929 4.929 19.07 19.071" }]],
			x: [["path", { d: "M18 6 6 18" }], ["path", { d: "m6 6 12 12" }]],
			trash: [
				["path", { d: "M3 6h18" }],
				["path", { d: "M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" }],
				["path", { d: "M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" }],
				["path", { d: "M10 11v6" }],
				["path", { d: "M14 11v6" }]
			],
			"message-square": [["path", { d: "M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z" }]],
			keyboard: [
				["path", { d: "M10 8h.01" }],
				["path", { d: "M12 12h.01" }],
				["path", { d: "M14 8h.01" }],
				["path", { d: "M16 12h.01" }],
				["path", { d: "M18 8h.01" }],
				["path", { d: "M6 8h.01" }],
				["path", { d: "M7 16h10" }],
				["path", { d: "M8 12h.01" }],
				["rect", {
					width: "20",
					height: "16",
					x: "2",
					y: "4",
					rx: "2"
				}]
			],
			smartphone: [["rect", {
				width: "14",
				height: "20",
				x: "5",
				y: "2",
				rx: "2",
				ry: "2"
			}], ["path", { d: "M12 18h.01" }]],
			"sliders-horizontal": [
				["path", { d: "M10 5H3" }],
				["path", { d: "M12 19H3" }],
				["path", { d: "M14 3v4" }],
				["path", { d: "M16 17v4" }],
				["path", { d: "M21 12h-9" }],
				["path", { d: "M21 19h-5" }],
				["path", { d: "M21 5h-7" }],
				["path", { d: "M8 10v4" }],
				["path", { d: "M8 12H3" }]
			],
			info: [
				["circle", {
					cx: "12",
					cy: "12",
					r: "10"
				}],
				["path", { d: "M12 16v-4" }],
				["path", { d: "M12 8h.01" }]
			],
			puzzle: [["path", { d: "M15.39 4.39a1 1 0 0 0 1.68-.474 2.5 2.5 0 1 1 3.014 3.015 1 1 0 0 0-.474 1.68l1.683 1.682a2.414 2.414 0 0 1 0 3.414L19.61 15.39a1 1 0 0 1-1.68-.474 2.5 2.5 0 1 0-3.014 3.015 1 1 0 0 1 .474 1.68l-1.683 1.682a2.414 2.414 0 0 1-3.414 0L8.61 19.61a1 1 0 0 0-1.68.474 2.5 2.5 0 1 1-3.014-3.015 1 1 0 0 0 .474-1.68l-1.683-1.682a2.414 2.414 0 0 1 0-3.414L4.39 8.61a1 1 0 0 1 1.68.474 2.5 2.5 0 1 0 3.014-3.015 1 1 0 0 1-.474-1.68l1.683-1.682a2.414 2.414 0 0 1 3.414 0z" }]],
			check: [["path", { d: "M20 6 9 17l-5-5" }]],
			laptop: [["path", { d: "M18 5a2 2 0 0 1 2 2v8.526a2 2 0 0 0 .212.897l1.068 2.127a1 1 0 0 1-.9 1.45H3.62a1 1 0 0 1-.9-1.45l1.068-2.127A2 2 0 0 0 4 15.526V7a2 2 0 0 1 2-2z" }], ["path", { d: "M20.054 15.987H3.946" }]],
			server: [
				["rect", {
					width: "20",
					height: "8",
					x: "2",
					y: "2",
					rx: "2",
					ry: "2"
				}],
				["rect", {
					width: "20",
					height: "8",
					x: "2",
					y: "14",
					rx: "2",
					ry: "2"
				}],
				["line", {
					x1: "6",
					x2: "6.01",
					y1: "6",
					y2: "6"
				}],
				["line", {
					x1: "6",
					x2: "6.01",
					y1: "18",
					y2: "18"
				}]
			],
			building: [
				["path", { d: "M12 10h.01" }],
				["path", { d: "M12 14h.01" }],
				["path", { d: "M12 6h.01" }],
				["path", { d: "M16 10h.01" }],
				["path", { d: "M16 14h.01" }],
				["path", { d: "M16 6h.01" }],
				["path", { d: "M8 10h.01" }],
				["path", { d: "M8 14h.01" }],
				["path", { d: "M8 6h.01" }],
				["path", { d: "M9 22v-3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3" }],
				["rect", {
					x: "4",
					y: "2",
					width: "16",
					height: "20",
					rx: "2"
				}]
			],
			briefcase: [["path", { d: "M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" }], ["rect", {
				width: "20",
				height: "14",
				x: "2",
				y: "6",
				rx: "2"
			}]],
			"flask-conical": [
				["path", { d: "M14 2v6a2 2 0 0 0 .245.96l5.51 10.08A2 2 0 0 1 18 22H6a2 2 0 0 1-1.755-2.96l5.51-10.08A2 2 0 0 0 10 8V2" }],
				["path", { d: "M6.453 15h11.094" }],
				["path", { d: "M8.5 2h7" }]
			],
			"gamepad-2": [
				["line", {
					x1: "6",
					x2: "10",
					y1: "11",
					y2: "11"
				}],
				["line", {
					x1: "8",
					x2: "8",
					y1: "9",
					y2: "13"
				}],
				["line", {
					x1: "15",
					x2: "15.01",
					y1: "12",
					y2: "12"
				}],
				["line", {
					x1: "18",
					x2: "18.01",
					y1: "10",
					y2: "10"
				}],
				["path", { d: "M17.32 5H6.68a4 4 0 0 0-3.978 3.59c-.006.052-.01.101-.017.152C2.604 9.416 2 14.456 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.414-1.414A2 2 0 0 1 9.828 16h4.344a2 2 0 0 1 1.414.586L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.545-.604-6.584-.685-7.258-.007-.05-.011-.1-.017-.151A4 4 0 0 0 17.32 5z" }]
			],
			paintbrush: [
				["path", { d: "m14.622 17.897-10.68-2.913" }],
				["path", { d: "M18.376 2.622a1 1 0 1 1 3.002 3.002L17.36 9.643a.5.5 0 0 0 0 .707l.944.944a2.41 2.41 0 0 1 0 3.408l-.944.944a.5.5 0 0 1-.707 0L8.354 7.348a.5.5 0 0 1 0-.707l.944-.944a2.41 2.41 0 0 1 3.408 0l.944.944a.5.5 0 0 0 .707 0z" }],
				["path", { d: "M9 8c-1.804 2.71-3.97 3.46-6.583 3.948a.507.507 0 0 0-.302.819l7.32 8.883a1 1 0 0 0 1.185.204C12.735 20.405 16 16.792 16 15" }]
			],
			"audio-lines": [
				["path", { d: "M2 10v3" }],
				["path", { d: "M6 6v11" }],
				["path", { d: "M10 3v18" }],
				["path", { d: "M14 8v7" }],
				["path", { d: "M18 5v13" }],
				["path", { d: "M22 10v3" }]
			],
			"book-open": [["path", { d: "M12 5v16" }], ["path", { d: "M20.001 19A2 2 0 0022 17V5a2 2 0 00-1.999-2L16 3.002A5 5 0 0012 5a5 5 0 00-4-2H4a2 2 0 00-2 2v12a2 2 0 001.999 2H8a5 5 0 014 2 5 5 0 014-2z" }]],
			zap: [["path", { d: "M15.914 4a1.5 1.5 0 00-2.474-1.561l-9 9A1.5 1.5 0 005.5 14h4.002a.5.5 0 01.471.666L8.086 20a1.5 1.5 0 002.475 1.56l9-9A1.5 1.5 0 0018.5 10h-3.997a.5.5 0 01-.472-.667z" }]],
			heart: [["path", { d: "M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5" }]],
			leaf: [["path", { d: "M11 20a10 10 0 0010-10 25.9 25.9 0 00-1.04-7.281 1 1 0 00-1.755-.325C15.833 5.5 13 5.5 9.8 6.1A7 7 0 0011 20" }], ["path", { d: "M2 21a5 5 0 012.911-4.544C7.613 15.212 8.351 15.24 11 13" }]],
			phone: [["path", { d: "M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384" }]],
			video: [["path", { d: "m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5" }], ["rect", {
				x: "2",
				y: "6",
				width: "14",
				height: "12",
				rx: "2"
			}]],
			"video-off": [
				["path", { d: "M10.66 6H14a2 2 0 0 1 2 2v2.5l5.248-3.062A.5.5 0 0 1 22 7.87v8.196" }],
				["path", { d: "M16 16a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h2" }],
				["path", { d: "m2 2 20 20" }]
			],
			"phone-off": [
				["path", { d: "M10.1 13.9a14 14 0 0 0 3.732 2.668 1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2 18 18 0 0 1-12.728-5.272" }],
				["path", { d: "M22 2 2 22" }],
				["path", { d: "M4.76 13.582A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 .244.473" }]
			],
			mic: [
				["path", { d: "M12 19v3" }],
				["path", { d: "M19 10v2a7 7 0 0 1-14 0v-2" }],
				["rect", {
					x: "9",
					y: "2",
					width: "6",
					height: "13",
					rx: "3"
				}]
			],
			"mic-off": [
				["path", { d: "M12 19v3" }],
				["path", { d: "M15 9.34V5a3 3 0 0 0-5.68-1.33" }],
				["path", { d: "M16.95 16.95A7 7 0 0 1 5 12v-2" }],
				["path", { d: "M18.89 13.23A7 7 0 0 0 19 12v-2" }],
				["path", { d: "m2 2 20 20" }],
				["path", { d: "M9 9v3a3 3 0 0 0 5.12 2.12" }]
			],
			tv: [["path", { d: "m17 2-5 5-5-5" }], ["rect", {
				width: "20",
				height: "15",
				x: "2",
				y: "7",
				rx: "2"
			}]]
		};
		function glyph(name) {
			return Object.hasOwn(glyphs, name) ? glyphs[name] : glyphs["panels-top-left"];
		}
		function ChannelSidebarIcon({ name = "panels-top-left", size = 16, filled = false, strokeWidth = 2, className }) {
			const nodes = glyph(name);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
				className,
				"data-icon": name,
				width: size,
				height: size,
				viewBox: "0 0 24 24",
				fill: filled ? "currentColor" : "none",
				stroke: "currentColor",
				strokeWidth,
				strokeLinecap: "round",
				strokeLinejoin: "round",
				"aria-hidden": "true",
				children: nodes.map(([tag, attributes], index) => (0, react.createElement)(tag, {
					...attributes,
					key: index
				}))
			});
		}
		//#endregion
		//#region node_modules/.pnpm/@stylexjs+stylex@0.19.1/node_modules/@stylexjs/stylex/lib/es/stylex.mjs
		var styleq = {};
		var hasRequiredStyleq;
		function requireStyleq() {
			if (hasRequiredStyleq) return styleq;
			hasRequiredStyleq = 1;
			Object.defineProperty(styleq, "__esModule", { value: true });
			styleq.styleq = void 0;
			var cache = /* @__PURE__ */ new WeakMap();
			var compiledKey = "$$css";
			function createStyleq(options) {
				var disableCache;
				var disableMix;
				var transform;
				if (options != null) {
					disableCache = options.disableCache === true;
					disableMix = options.disableMix === true;
					transform = options.transform;
				}
				return function styleq() {
					var definedProperties = [];
					var className = "";
					var inlineStyle = null;
					var debugString = "";
					var nextCache = disableCache ? null : cache;
					var styles = new Array(arguments.length);
					for (var i = 0; i < arguments.length; i++) styles[i] = arguments[i];
					while (styles.length > 0) {
						var possibleStyle = styles.pop();
						if (possibleStyle == null || possibleStyle === false) continue;
						if (Array.isArray(possibleStyle)) {
							for (var _i = 0; _i < possibleStyle.length; _i++) styles.push(possibleStyle[_i]);
							continue;
						}
						var style = transform != null ? transform(possibleStyle) : possibleStyle;
						if (style.$$css != null) {
							var classNameChunk = "";
							if (nextCache != null && nextCache.has(style)) {
								var cacheEntry = nextCache.get(style);
								if (cacheEntry != null) {
									classNameChunk = cacheEntry[0];
									debugString = cacheEntry[2];
									definedProperties.push.apply(definedProperties, cacheEntry[1]);
									nextCache = cacheEntry[3];
								}
							} else {
								var definedPropertiesChunk = [];
								for (var prop in style) {
									var value = style[prop];
									if (prop === compiledKey) {
										var compiledKeyValue = style[prop];
										if (compiledKeyValue !== true) debugString = debugString ? compiledKeyValue + "; " + debugString : compiledKeyValue;
										continue;
									}
									if (typeof value === "string" || value === null) {
										if (!definedProperties.includes(prop)) {
											definedProperties.push(prop);
											if (nextCache != null) definedPropertiesChunk.push(prop);
											if (typeof value === "string") classNameChunk += classNameChunk ? " " + value : value;
										}
									} else console.error("styleq: ".concat(prop, " typeof ").concat(String(value), " is not \"string\" or \"null\"."));
								}
								if (nextCache != null) {
									var weakMap = /* @__PURE__ */ new WeakMap();
									nextCache.set(style, [
										classNameChunk,
										definedPropertiesChunk,
										debugString,
										weakMap
									]);
									nextCache = weakMap;
								}
							}
							if (classNameChunk) className = className ? classNameChunk + " " + className : classNameChunk;
						} else if (disableMix) {
							if (inlineStyle == null) inlineStyle = {};
							inlineStyle = Object.assign({}, style, inlineStyle);
						} else {
							var subStyle = null;
							for (var _prop in style) {
								var _value = style[_prop];
								if (_value !== void 0) {
									if (!definedProperties.includes(_prop)) {
										if (_value != null) {
											if (inlineStyle == null) inlineStyle = {};
											if (subStyle == null) subStyle = {};
											subStyle[_prop] = _value;
										}
										definedProperties.push(_prop);
										nextCache = null;
									}
								}
							}
							if (subStyle != null) inlineStyle = Object.assign(subStyle, inlineStyle);
						}
					}
					return [
						className,
						inlineStyle,
						debugString
					];
				};
			}
			var styleq$1 = styleq.styleq = createStyleq();
			styleq$1.factory = createStyleq;
			return styleq;
		}
		var styleqExports = /*@__PURE__*/ requireStyleq();
		function props(...styles) {
			const [className, style, dataStyleSrc] = styleqExports.styleq(styles);
			const result = {};
			if (className != null && className !== "") result.className = className;
			if (style != null && Object.keys(style).length > 0) result.style = style;
			if (dataStyleSrc != null && dataStyleSrc !== "") result["data-style-src"] = dataStyleSrc;
			return result;
		}
		Object.freeze({});
		//#endregion
		//#region packages/client/src/client/ds/tobs.stylex.ts
		const size$3 = {
			icon: "16px",
			iconLarge: "20px",
			iconSlot: "20px",
			iconStroke: "1.5px",
			controlSmall: "24px",
			control: "28px",
			controlLarge: "32px",
			row: "28px",
			rowMedium: "36px",
			rowComfortable: "40px",
			rowLarge: "44px"
		};
		//#endregion
		//#region packages/client/src/client/ds/icon.tsx
		function Icon({ name, large = false, size, filled = false, className }) {
			const box = size ?? (large ? size$3.iconLarge : size$3.icon);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ChannelSidebarIcon, {
				name,
				size: box,
				filled,
				className,
				strokeWidth: Number.parseFloat(size$3.iconStroke) * 24 / Number.parseFloat(String(box))
			});
		}
		//#endregion
		//#region packages/client/src/client/ds/class-name.ts
		function joinClass(...names) {
			const joined = names.filter((name) => name !== void 0 && name !== "").join(" ");
			return joined === "" ? void 0 : joined;
		}
		//#endregion
		//#region packages/client/src/client/ds/tokens.stylex.ts
		const space = {
			x1: "2px",
			x2: "4px",
			x3: "8px",
			x4: "12px",
			x5: "16px",
			x6: "24px"
		};
		const text = {
			metaSize: "12px",
			metaLine: "16px",
			bodySize: "var(--tobs-style-text-ui-size)",
			bodyLine: "var(--tobs-style-text-ui-line)",
			titleSize: "15px",
			titleLine: "24px",
			regular: "400",
			strong: "500"
		};
		const radius = {
			xs: "4px",
			sm: "var(--tobs-style-radius-small)",
			control: "var(--tobs-style-radius-control)",
			md: "var(--tobs-style-radius-container)",
			lg: "var(--tobs-style-radius-card)",
			panel: "var(--tobs-style-radius-sheet)",
			round: "50%"
		};
		const border = {
			hairline: "1px",
			focus: "2px"
		};
		const color = {
			fg: "var(--tobs-ink-primary)",
			muted: "var(--tobs-ink-secondary)",
			subtle: "var(--tobs-ink-tertiary)",
			divider: "var(--tobs-line-divider)",
			border: "var(--tobs-line-edge)",
			borderStrong: "var(--tobs-line-strong)",
			hover: "var(--tobs-state-hover)",
			selected: "var(--tobs-state-pressed)",
			navSelected: "var(--tobs-style-nav-selected-fill)",
			navSelectedInk: "var(--tobs-style-nav-selected-ink)",
			accent: "var(--tobs-accent-solid)",
			accentText: "var(--tobs-accent-ink)",
			onAccent: "var(--tobs-accent-on-solid)",
			danger: "var(--tobs-status-danger-base)",
			onDanger: "var(--tobs-accent-on-solid)",
			dangerEdge: "color-mix(in srgb, var(--tobs-status-danger-base) 45%, transparent)",
			dangerSoft: "var(--tobs-status-danger-tint)",
			warning: "var(--tobs-status-warning-base)",
			warningEdge: "color-mix(in srgb, var(--tobs-status-warning-base) 45%, transparent)",
			warningSoft: "var(--tobs-status-warning-tint)",
			success: "var(--tobs-status-success-base)",
			surface: "var(--tobs-layer-raised)",
			elevated: "var(--tobs-layer-elevated)",
			base: "var(--tobs-layer-canvas)",
			modal: "var(--tobs-layer-sheet)",
			well: "var(--tobs-layer-well)",
			accentTint: "var(--tobs-accent-tint)"
		};
		//#endregion
		//#region packages/client/src/client/ds/button.tsx
		const styles$4 = {
			base: {
				kB7OPa: "bhx9f619",
				k1xSpc: "bhx3nfvp2",
				kGNEyG: "bhx6s0dn4",
				kjj79g: "bhxl56j7k",
				kOIVth: "bhx12e6dxb",
				kmuXW: "bhx2lah0s",
				k8WAf4: "bhxt970qd",
				kg3NbH: "bhxq23ktl",
				kMzoRj: "bhxc342km",
				kaIpWk: "bhxvz6vxc",
				kWkggS: "bhxjbqb8w",
				kMwMTN: "bhx103lb5k",
				kMv6JI: "bhxjb2p0i",
				kGuDYH: "bhx1779mkw",
				kLWn49: "bhxe5wb2f",
				k63SB2: "bhxk50ysn",
				khDVqt: "bhxuxw1ft",
				kkrTdU: "bhx1ypdohk bhx1s07b3s",
				kSiTet: "bhx1hc1fzr bhx1lfpgzf",
				kI3sdo: "bhx1a2a7pz bhx1i94p6w",
				kInvED: "bhx1hl8ikr",
				$$css: true
			},
			sm: {
				kZKoxP: "bhxisypcw",
				$$css: true
			},
			md: {
				kZKoxP: "bhx1cbrj4c",
				$$css: true
			},
			primary: {
				kWkggS: "bhx1rolmtn bhx1n57e5r",
				kMwMTN: "bhx14w2d3c",
				$$css: true
			},
			outline: {
				kWkggS: "bhxooed33",
				kMwMTN: "bhxv008iy",
				kGVxlE: "bhx1nopuv3",
				kKwaWg: "bhx18o3ruo bhxfdnnug",
				$$css: true
			},
			ghost: {
				kWkggS: "bhxjbqb8w bhxqta4pg bhx9mj4i6",
				$$css: true
			},
			toolbar: {
				kWkggS: "bhxp02wjs",
				kKwaWg: "bhx18o3ruo bhxfdnnug",
				$$css: true
			},
			preview: {
				kVAEAm: "bhx1n2onr6",
				kXwgrk: "bhxdt5ytf",
				kzqmXN: "bhxh8yej3",
				kZKoxP: "bhxt7dq6l",
				kOBAk4: "bhx2ebxmi",
				kmVPX3: "bhx1717udv",
				kVQacm: "bhxb3r6kr",
				kaIpWk: "bhxov8xcf",
				kInvED: "bhxkmyskz",
				kWkggS: "bhxp02wjs bhxqta4pg bhxl8ll33",
				kMwMTN: "bhx14lg19 bhx3h2lrv",
				$$css: true
			},
			icon: {
				k1xSpc: "bhx3nfvp2",
				kzqmXN: "bhx1x2ywmj",
				kZKoxP: "bhx6nhqxt",
				kGNEyG: "bhx6s0dn4",
				kjj79g: "bhxl56j7k",
				$$css: true
			}
		};
		const Button = (0, react.forwardRef)(function Button({ variant = "ghost", size = "md", icon, className, xstyle, children, ...rest }, ref) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
				ref,
				...rest,
				className: joinClass(props(styles$4.base, styles$4[size], styles$4[variant], xstyle).className, className),
				children: [icon == null ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: "bhx3nfvp2 bhx1x2ywmj bhx6nhqxt bhx6s0dn4 bhxl56j7k",
					children: icon
				}), children]
			});
		});
		//#endregion
		//#region packages/client/src/client/ds/switch.tsx
		function Switch({ checked, onChange, label, disabled = false, title, className }) {
			const track = {
				0: { className: "bhx9f619 bhx1n2onr6 bhx2lah0s bhxhtpqs2 bhx5ej1o7 bhx1717udv bhxc342km bhx1hir1rn bhx17wyupo bhxnyootd bhx1ypdohk bhxtgyt42 bhx1hc1fzr bhxijokvz bhx1a2a7pz bhx1i94p6w bhx1hl8ikr" },
				1: { className: "bhx9f619 bhx1n2onr6 bhx2lah0s bhxhtpqs2 bhx5ej1o7 bhx1717udv bhxc342km bhx1hir1rn bhx1ypdohk bhxtgyt42 bhx1hc1fzr bhxijokvz bhx1a2a7pz bhx1i94p6w bhx1hl8ikr bhx1rolmtn bhx1gnnqk1" }
			}[!!checked << 0];
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
				type: "button",
				role: "switch",
				"aria-checked": checked,
				"aria-label": label,
				title,
				disabled,
				className: joinClass(track.className, className),
				onClick: () => {
					onChange(!checked);
				},
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { ...{
					0: { className: "bhx10l6tqk bhxwa60dl bhxu96u03 bhx1lliihq bhx16m33ld bhx15ro3sd bhx13u8aww bhx1x7efqg bhx1dm6lkz bhxs12ov2 bhxjk0iim bhxtrec30 bhxtp3wbg" },
					1: { className: "bhx10l6tqk bhxwa60dl bhxu96u03 bhx1lliihq bhx13u8aww bhxjk0iim bhxtrec30 bhxtp3wbg bhxxbn18l bhx1xd5puz bhxn8qxt5 bhxjtbsy0 bhxyl194i" }
				}[!!checked << 0] })
			});
		}
		//#endregion
		//#region packages/client/src/client/ds/tag.tsx
		const styles$3 = {
			wrap: {
				khDVqt: "bhxeaf4i8",
				kHjlTd: "bhxj0a0fe",
				ks0D6T: "bhx193iq5w",
				$$css: true
			},
			tag: {
				kB7OPa: "bhx9f619",
				k1xSpc: "bhx3nfvp2",
				kGNEyG: "bhx6s0dn4",
				k8WAf4: "bhxgxqyfi",
				kg3NbH: "bhx1j7gxbw",
				kaIpWk: "bhx1hir1rn",
				kGuDYH: "bhx1cwq2zs",
				kLWn49: "bhxsxgpsl",
				k63SB2: "bhxk50ysn",
				khDVqt: "bhxuxw1ft",
				$$css: true
			},
			outline: {
				kGVxlE: "bhx1hle45t",
				kMwMTN: "bhx1axu3v7",
				$$css: true
			},
			solid: {
				kWkggS: "bhxdoljrk",
				kMwMTN: "bhxwm96u7",
				$$css: true
			},
			neutral: {
				kWkggS: "bhxp02wjs",
				kMwMTN: "bhx14lg19",
				$$css: true
			},
			quiet: {
				kMwMTN: "bhx1axu3v7",
				$$css: true
			},
			success: {
				kWkggS: "bhx1q91288",
				kMwMTN: "bhxcz3oas",
				$$css: true
			},
			info: {
				kWkggS: "bhx1m3nrc0",
				kMwMTN: "bhxigofnc",
				$$css: true
			},
			warning: {
				kWkggS: "bhxl8vzxm",
				kMwMTN: "bhx65eiyc",
				$$css: true
			},
			danger: {
				kWkggS: "bhxw91tbh",
				kMwMTN: "bhx1cq2c6i",
				$$css: true
			}
		};
		const Tag = (0, react.forwardRef)(function Tag({ tone = "neutral", className, wrap = false, ...props$1 }, ref) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				...props$1,
				ref,
				"data-tone": tone,
				className: joinClass(props(styles$3.tag, styles$3[tone], wrap && styles$3.wrap).className, className)
			});
		});
		//#endregion
		//#region packages/client/src/client/ds/empty-state.tsx
		function PanelEmptyState({ icon, children, action }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				role: "status",
				"data-panel-empty": "",
				className: "bhx78zum5 bhxdt5ytf bhx6s0dn4 bhxl56j7k bhx1iyjqo2 bhx1mckxr8 bhx1tsjn1a bhx9f619 bhx2b8uid bhxr3raxm",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						"aria-hidden": "true",
						className: "bhx1i1gie9 bhxdkzj7d bhx2lah0s bhxwq55zj",
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ChannelSidebarIcon, {
							name: icon,
							size: "100%"
						})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "bhx1ghz6dp bhxxc7z9f bhxr3raxm bhxgowt09 bhx12cu2lo",
						children
					}),
					action === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						"data-panel-empty-action": "",
						children: action
					})
				]
			});
		}
		//#endregion
		//#region packages/client/src/client/ds/pill-button.tsx
		function PillButton({ children, active, variant, className, as = "button", ...rest }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(as, {
				type: as === "button" ? "button" : void 0,
				...rest,
				"aria-pressed": as === "button" ? active : void 0,
				className: joinClass({
					0: { className: "bhx3nfvp2 bhx6s0dn4 bhx12e6dxb bhx193iq5w bhxxevliy bhx1vid4s1 bhxc342km bhxamr80a bhx1eunnl6 bhx8yp5u bhx24dycr bhxjb2p0i bhx5g6txa bhx3350y7 bhxuxw1ft bhx1ypdohk bhxtgyt42 bhx1hc1fzr bhxijokvz bhx1a2a7pz bhx1m95a6t bhx1y3gkto" },
					2: { className: "bhx3nfvp2 bhx6s0dn4 bhx12e6dxb bhx193iq5w bhxxevliy bhx1vid4s1 bhxc342km bhxamr80a bhxjb2p0i bhx5g6txa bhx3350y7 bhxuxw1ft bhx1ypdohk bhxtgyt42 bhx1hc1fzr bhxijokvz bhx1a2a7pz bhx1m95a6t bhx1y3gkto bhx1nycijx bhxyja9ir" },
					1: { className: "bhx3nfvp2 bhx6s0dn4 bhx12e6dxb bhx193iq5w bhxxevliy bhx1vid4s1 bhxc342km bhxamr80a bhxjb2p0i bhx5g6txa bhx3350y7 bhxuxw1ft bhx1ypdohk bhxtgyt42 bhx1hc1fzr bhxijokvz bhx1a2a7pz bhx1m95a6t bhx1y3gkto bhx1rolmtn bhx14w2d3c" },
					3: { className: "bhx3nfvp2 bhx6s0dn4 bhx12e6dxb bhx193iq5w bhxxevliy bhx1vid4s1 bhxc342km bhxamr80a bhxjb2p0i bhx5g6txa bhx3350y7 bhxuxw1ft bhx1ypdohk bhxtgyt42 bhx1hc1fzr bhxijokvz bhx1a2a7pz bhx1m95a6t bhx1y3gkto bhx1rolmtn bhx14w2d3c" }
				}[!!active << 1 | !!(variant === "primary") << 0].className, className),
				children
			});
		}
		//#endregion
		//#region packages/client/src/client/mounted-resource.ts
		function useMountedResource(start, dependencies) {
			const cleanup = (0, react.useRef)(void 0);
			return (0, react.useCallback)((node) => {
				cleanup.current?.();
				cleanup.current = void 0;
				if (node !== null) cleanup.current = start(node) || void 0;
			}, dependencies);
		}
		//#endregion
		//#region packages/client/src/client/remote-viewer/tokens.ts
		const BH = {
			labelSecondary: "var(--tobs-ink-secondary)",
			hoverFill: "var(--tobs-state-hover)",
			errorPrimary: "var(--tobs-status-danger-base)",
			radiusMd: "12px",
			labelPrimary: "var(--tobs-ink-primary, #0f1115)",
			labelPrimaryForeground: "var(--tobs-accent-on-solid, #ffffff)",
			borderL2: "var(--tobs-line-edge, #0000001a)",
			borderL3: "var(--tobs-line-strong, #0000001f)",
			borderL4: "var(--tobs-line-strong, #00000029)",
			bgBase: "var(--tobs-layer-canvas, #ffffff)",
			buttonPrimaryFill: "var(--tobs-accent-solid, #0f1115)",
			buttonElevatedFill: "var(--tobs-layer-elevated, transparent)",
			businessPrimary: "var(--tobs-accent-solid, #4176e6)",
			hoverScrim: "color-mix(in srgb, var(--tobs-layer-canvas) 35%, transparent)"
		};
		const VIDEO_SURFACE = {
			background: "#000000",
			spinnerTrack: "rgba(255, 255, 255, 0.18)",
			spinnerArc: "#ffffff",
			onVideo: "#ffffff"
		};
		//#endregion
		//#region packages/client/src/client/remote-viewer/viewer-state.ts
		function nextExpanded(action) {
			return action === "open";
		}
		function smoothPhase(shown, raw, streak) {
			if (raw === "live") return {
				phase: "live",
				streak: 0
			};
			if (shown !== "live") return {
				phase: raw,
				streak: 0
			};
			const next = streak + 1;
			if (next >= 2) return {
				phase: raw,
				streak: next
			};
			return {
				phase: shown,
				streak: next
			};
		}
		function dotStateFor(phase) {
			if (phase === "live") return "done";
			if (phase === "empty") return "error";
			return "ongoing";
		}
		function statusKeyFor(phase, reconnecting) {
			if (phase === "live") return "entry.live";
			if (phase === "empty") return "entry.noScreen";
			return reconnecting ? "entry.reconnecting" : "entry.connecting";
		}
		function stopKey(busy, stopping) {
			return busy || stopping ? "entry.stopping" : "entry.stop";
		}
		const STATUS_ELEMENT_ID = "status-display";
		const BUSY_TEXT = /connecting|reconnect|disconnect|failed|error/i;
		function hashBytes(data) {
			let hash = 2174524869;
			for (let index = 0; index < data.length; index += 1) {
				hash ^= data[index] ?? 0;
				hash = Math.imul(hash, 16777619);
			}
			return hash >>> 0;
		}
		function upstreamBusy(doc) {
			try {
				const element = doc?.getElementById(STATUS_ELEMENT_ID);
				if (element === null || element === void 0) return false;
				if (element.classList.contains("hidden")) return false;
				return BUSY_TEXT.test(element.textContent ?? "");
			} catch {
				return false;
			}
		}
		function signatureOf(doc, surface) {
			try {
				const scratch = doc.createElement("canvas");
				scratch.width = 16;
				scratch.height = 16;
				const context = scratch.getContext("2d", { willReadFrequently: true });
				if (context === null) return void 0;
				context.drawImage(surface, 0, 0, 16, 16);
				return hashBytes(context.getImageData(0, 0, 16, 16).data);
			} catch {
				return;
			}
		}
		function sampleSurface(doc) {
			const busy = upstreamBusy(doc);
			let sized = false;
			let signature;
			try {
				const surface = doc?.getElementById("videoCanvas");
				const videoWidth = surface?.videoWidth;
				const canvasWidth = surface?.width;
				sized = surface !== null && surface !== void 0 && (typeof videoWidth === "number" ? videoWidth : typeof canvasWidth === "number" ? canvasWidth : 0) > 0;
				if (sized && surface !== null && surface !== void 0 && doc !== null && doc !== void 0) signature = signatureOf(doc, surface);
			} catch {
				signature = void 0;
			}
			return signature === void 0 ? {
				sized,
				busy
			} : {
				sized,
				busy,
				signature
			};
		}
		function withSignature(base, signature) {
			return signature === void 0 ? { ...base } : {
				...base,
				lastSignature: signature
			};
		}
		function withPreviousSignature(base, prev) {
			return prev.lastSignature === void 0 ? { ...base } : {
				...base,
				lastSignature: prev.lastSignature
			};
		}
		function shouldRemountLoss(lossStreak) {
			return lossStreak >= 3;
		}
		function shouldAutoReload(phase, everLive, attempts) {
			return phase === "empty" && !everLive && attempts < 3;
		}
		function nextStreamTracker(prev, sample) {
			const signature = sample.signature;
			if (!sample.sized) {
				const misses = prev.misses + 1;
				return {
					tracker: withSignature({
						misses,
						busyStreak: 0,
						quiet: 0
					}, signature),
					phase: misses >= 6 ? "empty" : "connecting"
				};
			}
			if (sample.busy) {
				const busyStreak = prev.busyStreak + 1;
				return {
					tracker: withPreviousSignature({
						misses: prev.misses,
						busyStreak,
						quiet: 0
					}, prev),
					phase: busyStreak >= 30 ? "empty" : "connecting"
				};
			}
			if (signature !== void 0 && prev.lastSignature !== void 0 && signature !== prev.lastSignature) return {
				tracker: {
					...withSignature({
						misses: 0,
						busyStreak: 0,
						quiet: 0
					}, signature),
					live: true
				},
				phase: "live"
			};
			if (signature === void 0) return {
				tracker: {
					misses: 0,
					busyStreak: 0,
					quiet: 0,
					live: true
				},
				phase: "live"
			};
			const quiet = prev.quiet + 1;
			if (quiet >= 120) return {
				tracker: withSignature({
					misses: 6,
					busyStreak: 0,
					quiet
				}, signature),
				phase: "empty"
			};
			if (prev.live === true || quiet >= 4) return {
				tracker: {
					...withSignature({
						misses: 0,
						busyStreak: 0,
						quiet
					}, signature),
					live: true
				},
				phase: "live"
			};
			return {
				tracker: withSignature({
					misses: prev.misses,
					busyStreak: 0,
					quiet
				}, signature),
				phase: "connecting"
			};
		}
		//#endregion
		//#region packages/client/src/client/remote-viewer/index.tsx
		const SPIN_STYLE = "@keyframes bc-spin { to { transform: rotate(360deg); } }";
		function useStreamPhase(onSample) {
			return useMountedResource((iframe) => {
				let active = true;
				let tracker = {
					misses: 0,
					busyStreak: 0,
					quiet: 0
				};
				let timer;
				const check = () => {
					if (!active) return;
					let doc = null;
					try {
						doc = iframe.contentDocument;
					} catch {
						doc = null;
					}
					const next = nextStreamTracker(tracker, sampleSurface(doc));
					tracker = next.tracker;
					onSample(next.phase);
					timer = setTimeout(check, 1e3);
				};
				timer = setTimeout(check, 300);
				return () => {
					active = false;
					if (timer !== void 0) clearTimeout(timer);
				};
			}, [onSample]);
		}
		function ScreenIndicator({ label = "连接中" }) {
			const size = 26;
			const stroke = 2;
			const radius = 12;
			const circumference = 2 * Math.PI * radius;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				style: {
					position: "absolute",
					inset: 0,
					display: "grid",
					placeItems: "center",
					background: VIDEO_SURFACE.background,
					color: VIDEO_SURFACE.onVideo
				},
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: {
						display: "flex",
						flexDirection: "column",
						alignItems: "center",
						gap: 10
					},
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
						width: size,
						height: size,
						style: { animation: "bc-spin 1.1s linear infinite" },
						"aria-hidden": "true",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
							cx: size / 2,
							cy: size / 2,
							r: radius,
							fill: "none",
							stroke: VIDEO_SURFACE.spinnerTrack,
							strokeWidth: stroke
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
							cx: size / 2,
							cy: size / 2,
							r: radius,
							fill: "none",
							stroke: VIDEO_SURFACE.spinnerArc,
							strokeWidth: stroke,
							strokeLinecap: "round",
							strokeDasharray: `${String(circumference * .28)} ${String(circumference * .72)}`
						})]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						style: {
							fontSize: 12.5,
							opacity: .7
						},
						children: label
					})]
				})
			});
		}
		function ScreenEmpty({ t, onRetry }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				style: {
					position: "absolute",
					inset: 0,
					display: "grid",
					placeItems: "center",
					background: VIDEO_SURFACE.background,
					color: VIDEO_SURFACE.onVideo
				},
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: {
						display: "flex",
						flexDirection: "column",
						alignItems: "center",
						gap: 12
					},
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						style: {
							fontSize: 12.5,
							opacity: .75
						},
						children: t("entry.noScreen")
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Button, {
						variant: "toolbar",
						size: "sm",
						onClick: onRetry,
						children: t("entry.reconnect")
					})]
				})
			});
		}
		function StreamOverlay(props) {
			const { phase, reconnecting, hovered, t, onRetry, onOpen } = props;
			if (phase === "connecting") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ScreenIndicator, { label: t(statusKeyFor(phase, reconnecting)) });
			if (phase === "empty") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ScreenEmpty, {
				t,
				onRetry
			});
			if (!hovered) return null;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				style: {
					position: "absolute",
					inset: 0,
					display: "grid",
					placeItems: "center",
					background: BH.hoverScrim,
					borderRadius: 8
				},
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(PillButton, {
					onClick: onOpen,
					variant: "primary",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {
						name: "maximize",
						size: 14
					}), t("entry.openFullscreen")]
				})
			});
		}
		function ScaledFrame({ src, title, design, interactive, fit = "width", iframeRef }) {
			const DESIGN_WIDTH = design.width;
			const DESIGN_HEIGHT = design.height;
			const [box, setBox] = (0, react.useState)({
				width: DESIGN_WIDTH,
				height: DESIGN_HEIGHT
			});
			const resizeResource = useMountedResource((element) => {
				const frame = element.querySelector("iframe");
				if (frame !== null) {
					frame.inert = !interactive;
					if (!interactive) frame.blur();
				}
				const update = () => setBox({
					width: element.clientWidth,
					height: element.clientHeight
				});
				update();
				const observer = new ResizeObserver(update);
				observer.observe(element);
				return () => observer.disconnect();
			}, [interactive]);
			const scale = fit === "contain" ? Math.min(box.width / DESIGN_WIDTH, box.height / DESIGN_HEIGHT) : box.width / DESIGN_WIDTH;
			const offsetX = fit === "contain" ? Math.max(0, (box.width - DESIGN_WIDTH * scale) / 2) : 0;
			const offsetY = fit === "contain" ? Math.max(0, (box.height - DESIGN_HEIGHT * scale) / 2) : 0;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				ref: resizeResource,
				style: {
					position: "relative",
					width: "100%",
					...fit === "width" ? {
						aspectRatio: `${String(DESIGN_WIDTH)} / ${String(DESIGN_HEIGHT)}`,
						border: `1px solid ${BH.borderL3}`,
						borderRadius: 8
					} : { height: "100%" },
					overflow: "hidden",
					background: VIDEO_SURFACE.background
				},
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("iframe", {
					ref: iframeRef,
					title,
					src,
					tabIndex: interactive ? 0 : -1,
					style: {
						position: "absolute",
						top: 0,
						left: 0,
						width: DESIGN_WIDTH,
						height: DESIGN_HEIGHT,
						border: "none",
						transform: `translate(${String(offsetX)}px, ${String(offsetY)}px) scale(${String(scale)})`,
						transformOrigin: "top left",
						pointerEvents: interactive ? "auto" : "none"
					}
				})
			});
		}
		function CollapseIcon() {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
				width: 15,
				height: 15,
				viewBox: "0 0 24 24",
				fill: "none",
				stroke: "currentColor",
				strokeWidth: 2,
				strokeLinecap: "round",
				strokeLinejoin: "round",
				"aria-hidden": "true",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("polyline", { points: "4 14 10 14 10 20" }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("polyline", { points: "20 10 14 10 14 4" }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("line", {
						x1: "14",
						y1: "10",
						x2: "21",
						y2: "3"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("line", {
						x1: "3",
						y1: "21",
						x2: "10",
						y2: "14"
					})
				]
			});
		}
		function StopButton({ t, busy, stopping, onStop }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Button, {
				variant: "ghost",
				size: "sm",
				disabled: busy || stopping,
				onClick: onStop,
				children: busy || stopping ? t("entry.stopping") : t("entry.stop")
			});
		}
		function ViewerTitleBar(props) {
			const { t, title, phase, reconnecting, busy, stopping, interactive, extraControls, onToggleInteractive, onStop, onCollapse, hideStop, hideInteractiveToggle } = props;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: {
					display: "flex",
					alignItems: "center",
					gap: 8,
					height: 44,
					flex: "0 0 auto",
					padding: "0 8px 0 14px",
					borderBottom: `1px solid ${BH.borderL2}`,
					color: BH.labelPrimary,
					background: BH.bgBase
				},
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.StateDot, { state: dotStateFor(phase) }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", {
						style: {
							fontSize: 13,
							fontWeight: 600,
							minWidth: 0,
							overflow: "hidden",
							textOverflow: "ellipsis",
							whiteSpace: "nowrap"
						},
						children: title
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						style: {
							fontSize: 12,
							opacity: .65
						},
						children: t(statusKeyFor(phase, reconnecting))
					}),
					interactive ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						style: {
							fontSize: 12,
							opacity: .65
						},
						children: t("entry.watchOnly")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { style: { flex: 1 } }),
					extraControls,
					hideInteractiveToggle ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Button, {
						variant: interactive ? "ghost" : "primary",
						size: "sm",
						"aria-pressed": interactive,
						onClick: onToggleInteractive,
						disabled: busy || stopping,
						title: t(interactive ? "entry.interactive.disable" : "entry.interactive.enable"),
						children: t(interactive ? "entry.interactive.disable" : "entry.interactive.enable")
					}),
					hideStop === true ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(StopButton, {
						t,
						busy,
						stopping,
						onStop
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Button, {
						variant: "ghost",
						size: "sm",
						onClick: onCollapse,
						"aria-label": t("entry.collapseFullscreen"),
						title: t("entry.collapseFullscreen"),
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CollapseIcon, {})
					})
				]
			});
		}
		function RemoteViewer({ t, title, src, design, busy, stopping, onStop, footer, notice, extraControls, onEvent, interactive, onToggleInteractive, onDisableInteraction, expanded: controlledExpanded, onExpandedChange, hideStop, hideInteractiveToggle, allowFrameInput }) {
			const entryRef = (0, react.useRef)(null);
			const mounted = (0, react.useRef)(false);
			const [hovered, setHovered] = (0, react.useState)(false);
			const [ownExpanded, setOwnExpanded] = (0, react.useState)(false);
			const expanded = controlledExpanded ?? ownExpanded;
			const setExpanded = (next) => {
				setOwnExpanded(next);
				onExpandedChange?.(next);
			};
			const [inputEnabled, setInputEnabled] = (0, react.useState)(false);
			const [reloadKey, setReloadKey] = (0, react.useState)(0);
			const [reconnecting, setReconnecting] = (0, react.useState)(false);
			const wasReady = (0, react.useRef)(false);
			const autoReloads = (0, react.useRef)(0);
			const lossStreak = (0, react.useRef)(0);
			const phaseRef = (0, react.useRef)("connecting");
			const [smooth, setSmooth] = (0, react.useState)({
				phase: "connecting",
				streak: 0
			});
			const resetFrame = (0, react.useCallback)(() => {
				phaseRef.current = "connecting";
				setSmooth({
					phase: "connecting",
					streak: 0
				});
				setReloadKey((key) => key + 1);
			}, []);
			const streamRef = useStreamPhase((0, react.useCallback)((nextPhase) => {
				const fromPhase = phaseRef.current;
				if (fromPhase !== nextPhase) {
					phaseRef.current = nextPhase;
					setSmooth((current) => smoothPhase(current.phase, nextPhase, current.streak));
					onEvent?.({
						type: "phase",
						from: fromPhase,
						to: nextPhase
					});
				}
				if (nextPhase === "live") {
					wasReady.current = true;
					autoReloads.current = 0;
					lossStreak.current = 0;
					setReconnecting(false);
					return;
				}
				if (wasReady.current) {
					lossStreak.current += 1;
					if (shouldRemountLoss(lossStreak.current)) {
						wasReady.current = false;
						lossStreak.current = 0;
						onEvent?.({
							type: "loss-remount",
							streak: 3
						});
						setReconnecting(true);
						resetFrame();
						return;
					}
				}
				if (fromPhase !== nextPhase && shouldAutoReload(nextPhase, wasReady.current, autoReloads.current)) {
					autoReloads.current += 1;
					onEvent?.({
						type: "auto-reload",
						attempt: autoReloads.current
					});
					resetFrame();
				}
			}, [resetFrame, onEvent]));
			const phase = smooth.phase;
			const reconnect = () => {
				onEvent?.({ type: "manual-retry" });
				setReconnecting(true);
				autoReloads.current = 0;
				lossStreak.current = 0;
				wasReady.current = false;
				resetFrame();
			};
			const openViewer = () => {
				setExpanded(nextExpanded("open"));
				onEvent?.({
					type: "overlay",
					open: true
				});
			};
			const collapseViewer = () => {
				setInputEnabled(false);
				onDisableInteraction?.();
				setExpanded(nextExpanded("collapse"));
				onEvent?.({
					type: "overlay",
					open: false
				});
				requestAnimationFrame(() => entryRef.current?.focus());
			};
			const dialogResource = useMountedResource((dialog) => {
				if (!mounted.current) {
					mounted.current = true;
					onEvent?.({ type: "mount" });
				}
				if (!expanded) return;
				const onKey = (event) => {
					if (event.key !== "Tab") return;
					const focusable = [...dialog.querySelectorAll("button, [href], iframe, [tabindex]:not([tabindex=\"-1\"])")].filter((element) => element.tabIndex !== -1);
					const first = focusable[0];
					const last = focusable.at(-1);
					if (first === void 0 || last === void 0) return;
					const active = document.activeElement;
					if (event.shiftKey && (active === first || active === dialog)) {
						event.preventDefault();
						last.focus();
					} else if (!event.shiftKey && active === last) {
						event.preventDefault();
						first.focus();
					}
				};
				document.addEventListener("keydown", onKey);
				const previousOverflow = document.body.style.overflow;
				document.body.style.overflow = "hidden";
				dialog.focus();
				return () => {
					document.removeEventListener("keydown", onKey);
					document.body.style.overflow = previousOverflow;
				};
			}, [
				expanded,
				onDisableInteraction,
				onEvent
			]);
			const statusText = t(statusKeyFor(phase, reconnecting));
			const openable = phase === "live" && !expanded;
			const overlay = /* @__PURE__ */ (0, react_jsx_runtime.jsx)(StreamOverlay, {
				phase,
				reconnecting,
				hovered: expanded ? false : hovered,
				t,
				onRetry: reconnect,
				onOpen: openViewer
			});
			const stopLabel = t(stopKey(busy, stopping));
			const rowButton = (disabled) => ({
				flex: 1,
				display: "inline-flex",
				alignItems: "center",
				justifyContent: "center",
				height: 28,
				padding: "0 10px",
				borderRadius: 14,
				border: `1px solid ${BH.borderL3}`,
				background: BH.buttonElevatedFill,
				color: BH.labelPrimary,
				fontSize: 12,
				...disabled ? {
					opacity: .4,
					cursor: "not-allowed"
				} : { cursor: "pointer" }
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				ref: dialogResource,
				"data-bh-remote-viewer-fullscreen": expanded ? "" : void 0,
				role: expanded ? "dialog" : void 0,
				"aria-modal": expanded ? true : void 0,
				"aria-label": expanded ? title : void 0,
				tabIndex: expanded ? -1 : void 0,
				style: expanded ? {
					position: "fixed",
					inset: 0,
					zIndex: 100,
					display: "flex",
					flexDirection: "column",
					background: BH.bgBase,
					color: BH.labelPrimary
				} : {
					display: "flex",
					flexDirection: "column",
					gap: 8
				},
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("style", { children: SPIN_STYLE }),
					expanded ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ViewerTitleBar, {
						t,
						title,
						phase,
						reconnecting,
						busy,
						stopping,
						extraControls,
						interactive: interactive ?? inputEnabled,
						onToggleInteractive: onToggleInteractive ?? (() => setInputEnabled((current) => !current)),
						onStop,
						onCollapse: collapseViewer,
						hideStop,
						hideInteractiveToggle
					}, "viewer-titlebar") : null,
					notice,
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						ref: entryRef,
						role: openable ? "button" : void 0,
						tabIndex: openable ? 0 : void 0,
						"aria-label": openable ? t("entry.openFullscreen") : statusText,
						onMouseEnter: () => setHovered(true),
						onMouseLeave: () => setHovered(false),
						onClick: () => {
							if (openable) openViewer();
						},
						onKeyDown: (event) => {
							if (!openable) return;
							if (event.key !== "Enter" && event.key !== " ") return;
							event.preventDefault();
							openViewer();
						},
						style: expanded ? {
							position: "relative",
							flex: 1,
							minHeight: 0
						} : {
							position: "relative",
							cursor: openable ? "pointer" : "default"
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ScaledFrame, {
							src,
							title,
							design,
							interactive: allowFrameInput === true ? true : expanded && (interactive ?? inputEnabled),
							fit: expanded ? "contain" : "width",
							iframeRef: streamRef
						}, reloadKey), overlay]
					}, "viewer-frame"),
					expanded ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react.Fragment, { children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							style: {
								fontSize: 13,
								fontWeight: 500,
								color: BH.labelPrimary,
								opacity: .9,
								textAlign: "center"
							},
							children: title
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: {
								display: "flex",
								gap: 8
							},
							children: [hideStop === true ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								disabled: busy || stopping,
								onClick: onStop,
								style: rowButton(busy || stopping),
								children: stopLabel
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								onClick: reconnect,
								title: t("entry.reconnect"),
								style: rowButton(false),
								children: t("entry.reconnect")
							})]
						}),
						footer
					] }, "viewer-chrome")
				]
			});
		}
		//#endregion
		//#region node_modules/.pnpm/@base-ui+utils@0.5.0_@types+react@18.3.31_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/utils/useRefWithInit.mjs
		const UNINITIALIZED = {};
		/**
		* A React.useRef() that is initialized with a function. Note that it accepts an optional
		* initialization argument, so the initialization function doesn't need to be an inline closure.
		*
		* @usage
		*   const ref = useRefWithInit(sortColumns, columns)
		*/
		function useRefWithInit(init, initArg) {
			const ref = react.useRef(UNINITIALIZED);
			if (ref.current === UNINITIALIZED) ref.current = init(initArg);
			return ref;
		}
		//#endregion
		//#region node_modules/.pnpm/@base-ui+utils@0.5.0_@types+react@18.3.31_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/utils/fastHooks.mjs
		const hooks = [];
		let currentInstance = void 0;
		function getInstance() {
			return currentInstance;
		}
		function register(hook) {
			hooks.push(hook);
		}
		/**
		* Wraps a component function to enable performance optimizations for internal hooks.
		*
		* **Performance Optimization:**
		* Components wrapped with `fastComponent` have access to a shared "instance" context that enables
		* specialized hook implementations to batch operations and reduce overhead. The wrapper creates a
		* stable instance object that persists across renders, sets it as the current context, calls
		* registered hooks before and after rendering, then clears the context. The primary benefit is
		* with `useStore`, where multiple store subscriptions within the same component are collapsed into
		* a single `useSyncExternalStore` subscription per store, significantly reducing re-render overhead.
		* This optimization is only active on React 19+; on earlier versions `useStore` falls back to a
		* separate subscription per call.
		*
		* **Requirements:**
		* - The component function should follow standard React component patterns
		* - `useStore` calls must keep a stable order and count across renders, as batched hooks are
		*   matched by call index
		* - Do not rely on the instance context outside of specialized hooks
		*
		* @param fn - The component function to wrap
		* @returns A wrapped component with the same signature as the input function
		*
		* @example
		* ```tsx
		* // Wrapping a component to enable optimized useStore batching
		* export const TooltipRoot = fastComponent(function TooltipRoot(props) {
		*   // These useStore calls share a single subscription
		*   const open = useStore(store, (state) => state.open);
		*   const disabled = useStore(store, (state) => state.disabled);
		*   const value = useStore(store, (state) => state.value);
		*   // ...
		* });
		* ```
		*/
		function fastComponent(fn) {
			const FastComponent = (props, forwardedRef) => {
				const instance = useRefWithInit(createInstance).current;
				let result;
				try {
					currentInstance = instance;
					for (const hook of hooks) hook.before(instance);
					result = fn(props, forwardedRef);
					for (const hook of hooks) hook.after(instance);
					instance.didInitialize = true;
				} finally {
					currentInstance = void 0;
				}
				return result;
			};
			FastComponent.displayName = fn.displayName || fn.name;
			return FastComponent;
		}
		/**
		* Wraps a component function with ref forwarding to enable performance optimizations for internal hooks.
		*
		* This is a convenience wrapper that combines `fastComponent` with `React.forwardRef`, enabling
		* both performance optimizations and proper ref forwarding. See `fastComponent` for details on
		* the performance benefits.
		*
		* @param fn - The component function that accepts props and a forwarded ref
		* @returns A wrapped component with ref forwarding enabled
		*
		* @example
		* ```tsx
		* // Wrapping a component with ref forwarding and optimized hooks
		* export const TooltipTrigger = fastComponentRef(function TooltipTrigger(
		*   props,
		*   forwardedRef
		* ) {
		*   const store = useContext(TooltipContext);
		*   const open = useStore(store, (state) => state.open);
		*   // ... component logic with ref
		*   return <button ref={forwardedRef} {...props} />;
		* });
		* ```
		*/
		function fastComponentRef(fn) {
			return /*#__PURE__*/ react.forwardRef(fastComponent(fn));
		}
		function createInstance() {
			return { didInitialize: false };
		}
		//#endregion
		//#region node_modules/.pnpm/@base-ui+utils@0.5.0_@types+react@18.3.31_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/utils/empty.mjs
		function NOOP() {}
		const EMPTY_ARRAY = Object.freeze([]);
		const EMPTY_OBJECT = Object.freeze({});
		//#endregion
		//#region node_modules/.pnpm/@base-ui+utils@0.5.0_@types+react@18.3.31_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/utils/useIsoLayoutEffect.mjs
		const noop = () => {};
		const useIsoLayoutEffect = typeof document !== "undefined" ? react.useLayoutEffect : noop;
		//#endregion
		//#region node_modules/.pnpm/@base-ui+utils@0.5.0_@types+react@18.3.31_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/utils/formatErrorMessage.mjs
		/**
		* Creates a formatErrorMessage function with a custom URL and prefix.
		* @param baseUrl - The base URL for the error page (e.g., 'https://base-ui.com/production-error')
		* @param prefix - The prefix for the error message (e.g., 'Base UI')
		* @returns A function that formats error messages with the given URL and prefix
		*/
		function createFormatErrorMessage(baseUrl, prefix) {
			return function formatErrorMessage(code, ...args) {
				const url = new URL(baseUrl);
				url.searchParams.set("code", code.toString());
				args.forEach((arg) => url.searchParams.append("args[]", arg));
				return `${prefix} error #${code}; visit ${url} for the full message.`;
			};
		}
		/**
		* WARNING: Don't import this directly. It's imported by the code generated by
		* `@mui/internal-babel-plugin-minify-errors`. Make sure to always use string literals in `Error`
		* constructors to ensure the plugin works as expected. Supported patterns include:
		*   throw new Error('My message');
		*   throw new Error(`My message: ${foo}`);
		*   throw new Error(`My message: ${foo}` + 'another string');
		*   ...
		*/
		const formatErrorMessage = createFormatErrorMessage("https://base-ui.com/production-error", "Base UI");
		//#endregion
		//#region node_modules/.pnpm/@base-ui+react@1.9.0_@date-fns+tz@1.5.0_@types+react@18.3.31_date-fns@4.4.0_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/react/tooltip/root/TooltipRootContext.mjs
		const TooltipRootContext = /*#__PURE__*/ react.createContext(void 0);
		function useTooltipRootContext(optional) {
			const context = react.useContext(TooltipRootContext);
			if (context === void 0 && !optional) throw new Error(formatErrorMessage(72));
			return context;
		}
		//#endregion
		//#region node_modules/.pnpm/@base-ui+utils@0.5.0_@types+react@18.3.31_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/utils/useOnMount.mjs
		/**
		* A React.useEffect equivalent that runs once, when the component is mounted.
		*/
		function useOnMount(fn) {
			react.useEffect(fn, EMPTY_ARRAY);
		}
		//#endregion
		//#region node_modules/.pnpm/@base-ui+utils@0.5.0_@types+react@18.3.31_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/utils/useTimeout.mjs
		const EMPTY$1 = 0;
		var Timeout = class Timeout {
			static create() {
				return new Timeout();
			}
			currentId = EMPTY$1;
			/**
			* Executes `fn` after `delay`, clearing any previously scheduled call.
			*/
			start(delay, fn) {
				this.clear();
				this.currentId = setTimeout(() => {
					this.currentId = EMPTY$1;
					fn();
				}, delay);
			}
			isStarted() {
				return this.currentId !== EMPTY$1;
			}
			clear = () => {
				if (this.currentId !== EMPTY$1) {
					clearTimeout(this.currentId);
					this.currentId = EMPTY$1;
				}
			};
			disposeEffect = () => {
				return this.clear;
			};
		};
		/**
		* A `setTimeout` with automatic cleanup and guard.
		*/
		function useTimeout() {
			const timeout = useRefWithInit(Timeout.create).current;
			useOnMount(timeout.disposeEffect);
			return timeout;
		}
		//#endregion
		//#region node_modules/.pnpm/@base-ui+utils@0.5.0_@types+react@18.3.31_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/utils/platform/shared.mjs
		/**
		* Reads `navigator.userAgent` / `navigator.platform` (legacy but universally
		* supported) into a normalized shape. In development, prefers the modern
		* `navigator.userAgentData` API on Chromium to avoid DevTools warnings about
		* the deprecated reads; that branch is dead-code-eliminated in production
		* builds to keep the bundle small.
		*
		* Returns empty/zero values when `navigator` is undefined (SSR), so every
		* derived flag safely evaluates to `false`.
		*/
		function readRawData() {
			if (typeof navigator === "undefined") return {
				userAgent: "",
				platform: "",
				maxTouchPoints: 0
			};
			return {
				userAgent: navigator.userAgent,
				platform: navigator.platform ?? "",
				maxTouchPoints: navigator.maxTouchPoints ?? 0
			};
		}
		const { userAgent, platform: platform$1, maxTouchPoints } = readRawData();
		const lowerUserAgent = userAgent.toLowerCase();
		const lowerPlatform = platform$1.toLowerCase();
		//#endregion
		//#region node_modules/.pnpm/@base-ui+utils@0.5.0_@types+react@18.3.31_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/utils/platform/os.mjs
		/** iPhone, iPad (including iPadOS 13+ reporting as macOS), iPod. */
		const ios = /^i(os$|p)/.test(lowerPlatform) || lowerPlatform === "macintel" && maxTouchPoints > 1;
		/** Android phones, tablets, and embedded Android browsers. */
		const ANDROID_STRING = "android";
		const android = lowerPlatform === ANDROID_STRING || lowerUserAgent.includes(ANDROID_STRING);
		/** macOS desktop. Excludes iPadOS, which reports as `MacIntel`. */
		const mac = !ios && lowerPlatform.startsWith("mac");
		lowerPlatform.startsWith("win");
		!android && /^(linux|chrome os)/.test(lowerPlatform);
		/** Any Apple OS (`mac || ios`). */
		const apple = mac || ios;
		//#endregion
		//#region node_modules/.pnpm/@base-ui+utils@0.5.0_@types+react@18.3.31_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/utils/platform/engine.mjs
		/** WebKit: Safari, all iOS browsers, GNOME Web. Excludes Blink. */
		const webkit = typeof CSS !== "undefined" && !!CSS.supports?.("-webkit-backdrop-filter:none");
		!webkit && lowerUserAgent.includes("firefox");
		!webkit && lowerUserAgent.includes("chrom");
		//#endregion
		//#region node_modules/.pnpm/@base-ui+utils@0.5.0_@types+react@18.3.31_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/utils/platform/screen-reader.mjs
		/**
		* The user *may* be using VoiceOver — actual activation is not detectable.
		* True on any Apple platform (macOS, iOS, iPadOS).
		*/
		const voiceOver = apple;
		//#endregion
		//#region node_modules/.pnpm/@base-ui+utils@0.5.0_@types+react@18.3.31_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/utils/platform/env.mjs
		/** Running in jsdom or HappyDOM (used by unit tests). */
		const jsdom = /jsdom|happydom/.test(lowerUserAgent);
		//#endregion
		//#region node_modules/.pnpm/@base-ui+react@1.9.0_@date-fns+tz@1.5.0_@types+react@18.3.31_date-fns@4.4.0_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/react/floating-ui-react/utils/event.mjs
		function stopEvent(event) {
			event.preventDefault();
			event.stopPropagation();
		}
		function isReactEvent(event) {
			return "nativeEvent" in event;
		}
		function isVirtualClick(event) {
			if (event.pointerType === "" && event.isTrusted) return true;
			if (android && event.pointerType) return event.type === "click" && event.buttons === 1;
			return event.detail === 0 && !event.pointerType;
		}
		function isVirtualPointerEvent(event) {
			if (jsdom) return false;
			return !android && event.width === 0 && event.height === 0 || event.type === "pointerdown" && event.width === 1 && event.height === 1 && event.pressure === 0 && event.detail === 0 && event.pointerType === "mouse" && (android || event.buttons === 0) || event.width < 1 && event.height < 1 && event.pressure === 0 && event.detail === 0 && event.pointerType === "touch";
		}
		function isMouseLikePointerType(pointerType, strict) {
			const values = ["mouse", "pen"];
			if (!strict) values.push("", void 0);
			return values.includes(pointerType);
		}
		function isClickLikeEvent(event) {
			const type = event.type;
			return type === "click" || type === "mousedown" || type === "keydown" || type === "keyup";
		}
		//#endregion
		//#region node_modules/.pnpm/@floating-ui+utils@0.2.12/node_modules/@floating-ui/utils/dist/floating-ui.utils.dom.mjs
		function hasWindow() {
			return typeof window !== "undefined";
		}
		function getNodeName(node) {
			if (isNode(node)) return (node.nodeName || "").toLowerCase();
			return "#document";
		}
		function getWindow(node) {
			var _node$ownerDocument;
			return (node == null || (_node$ownerDocument = node.ownerDocument) == null ? void 0 : _node$ownerDocument.defaultView) || window;
		}
		function getDocumentElement(node) {
			var _ref;
			return (_ref = (isNode(node) ? node.ownerDocument : node.document) || window.document) == null ? void 0 : _ref.documentElement;
		}
		function isNode(value) {
			if (!hasWindow()) return false;
			return value instanceof Node || value instanceof getWindow(value).Node;
		}
		function isElement(value) {
			if (!hasWindow()) return false;
			return value instanceof Element || value instanceof getWindow(value).Element;
		}
		function isHTMLElement(value) {
			if (!hasWindow()) return false;
			return value instanceof HTMLElement || value instanceof getWindow(value).HTMLElement;
		}
		function isShadowRoot(value) {
			if (!hasWindow() || typeof ShadowRoot === "undefined") return false;
			return value instanceof ShadowRoot || value instanceof getWindow(value).ShadowRoot;
		}
		function isOverflowElement(element) {
			const { overflow, overflowX, overflowY, display } = getComputedStyle$1(element);
			return /auto|scroll|overlay|hidden|clip/.test(overflow + overflowY + overflowX) && display !== "inline" && display !== "contents";
		}
		function isTableElement(element) {
			return /^(table|td|th)$/.test(getNodeName(element));
		}
		function isTopLayer(element) {
			try {
				if (element.matches(":popover-open")) return true;
			} catch (_e) {}
			try {
				return element.matches(":modal");
			} catch (_e) {
				return false;
			}
		}
		const willChangeRe = /transform|translate|scale|rotate|perspective|filter/;
		const containRe = /paint|layout|strict|content/;
		const isNotNone = (value) => !!value && value !== "none";
		let isWebKitValue;
		function isContainingBlock(elementOrCss) {
			const css = isElement(elementOrCss) ? getComputedStyle$1(elementOrCss) : elementOrCss;
			return isNotNone(css.transform) || isNotNone(css.translate) || isNotNone(css.scale) || isNotNone(css.rotate) || isNotNone(css.perspective) || !isWebKit() && (isNotNone(css.backdropFilter) || isNotNone(css.filter)) || willChangeRe.test(css.willChange || "") || containRe.test(css.contain || "");
		}
		function getContainingBlock(element) {
			let currentNode = getParentNode(element);
			while (isHTMLElement(currentNode) && !isLastTraversableNode(currentNode)) {
				if (isContainingBlock(currentNode)) return currentNode;
				else if (isTopLayer(currentNode)) return null;
				currentNode = getParentNode(currentNode);
			}
			return null;
		}
		function isWebKit() {
			if (isWebKitValue == null) isWebKitValue = typeof CSS !== "undefined" && CSS.supports && CSS.supports("-webkit-backdrop-filter", "none");
			return isWebKitValue;
		}
		function isLastTraversableNode(node) {
			return /^(html|body|#document)$/.test(getNodeName(node));
		}
		function getComputedStyle$1(element) {
			return getWindow(element).getComputedStyle(element);
		}
		function getNodeScroll(element) {
			if (isElement(element)) return {
				scrollLeft: element.scrollLeft,
				scrollTop: element.scrollTop
			};
			return {
				scrollLeft: element.scrollX,
				scrollTop: element.scrollY
			};
		}
		function getParentNode(node) {
			if (getNodeName(node) === "html") return node;
			const result = node.assignedSlot || node.parentNode || isShadowRoot(node) && node.host || getDocumentElement(node);
			return isShadowRoot(result) ? result.host : result;
		}
		function getNearestOverflowAncestor(node) {
			const parentNode = getParentNode(node);
			if (isLastTraversableNode(parentNode)) return (node.ownerDocument || node).body;
			if (isHTMLElement(parentNode) && isOverflowElement(parentNode)) return parentNode;
			return getNearestOverflowAncestor(parentNode);
		}
		function getOverflowAncestors(node, list, traverseIframes) {
			var _node$ownerDocument2;
			if (list === void 0) list = [];
			if (traverseIframes === void 0) traverseIframes = true;
			const scrollableAncestor = getNearestOverflowAncestor(node);
			const isBody = scrollableAncestor === ((_node$ownerDocument2 = node.ownerDocument) == null ? void 0 : _node$ownerDocument2.body);
			const win = getWindow(scrollableAncestor);
			if (isBody) {
				const frameElement = getFrameElement(win);
				return list.concat(win, win.visualViewport || [], isOverflowElement(scrollableAncestor) ? scrollableAncestor : [], frameElement && traverseIframes ? getOverflowAncestors(frameElement) : []);
			} else return list.concat(scrollableAncestor, getOverflowAncestors(scrollableAncestor, [], traverseIframes));
		}
		function getFrameElement(win) {
			return win.parent && Object.getPrototypeOf(win.parent) ? win.frameElement : null;
		}
		//#endregion
		//#region node_modules/.pnpm/@base-ui+utils@0.5.0_@types+react@18.3.31_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/utils/shadowDom.mjs
		function activeElement(doc) {
			let element = doc.activeElement;
			while (element?.shadowRoot?.activeElement != null) element = element.shadowRoot.activeElement;
			return element;
		}
		function contains(parent, child) {
			if (!parent || !child) return false;
			const rootNode = child.getRootNode?.();
			if (parent.contains(child)) return true;
			if (rootNode && isShadowRoot(rootNode)) {
				let next = child;
				while (next) {
					if (parent === next) return true;
					next = next.parentNode || next.host;
				}
			}
			return false;
		}
		/**
		* Finds the closest matching element in the composed tree, crossing slots and shadow roots.
		* `:scope` is not supported.
		*/
		function closest(node, selector) {
			let current = node;
			while (current) {
				if (isElement(current) && current.matches(selector)) return current;
				current = current.assignedSlot ?? current.parentNode ?? (isShadowRoot(current) ? current.host : null);
			}
			return null;
		}
		function getTarget(event) {
			if ("composedPath" in event) return event.composedPath()[0] ?? event.target;
			return event.target;
		}
		//#endregion
		//#region node_modules/.pnpm/@base-ui+react@1.9.0_@date-fns+tz@1.5.0_@types+react@18.3.31_date-fns@4.4.0_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/react/floating-ui-react/utils/constants.mjs
		const FOCUSABLE_ATTRIBUTE = "data-base-ui-focusable";
		const TYPEABLE_SELECTOR = "input:not([type='hidden']):not([disabled]),[contenteditable]:not([contenteditable='false']),textarea:not([disabled])";
		const ARROW_LEFT$1 = "ArrowLeft";
		const ARROW_RIGHT$1 = "ArrowRight";
		const ARROW_UP$1 = "ArrowUp";
		const ARROW_DOWN$1 = "ArrowDown";
		//#endregion
		//#region node_modules/.pnpm/@base-ui+react@1.9.0_@date-fns+tz@1.5.0_@types+react@18.3.31_date-fns@4.4.0_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/react/internals/TransitionStatusDataAttributes.mjs
		/**
		* Present when the component begins animating in.
		*/
		const startingStyle = "data-starting-style";
		/**
		* Present when the component is animating out.
		*/
		const endingStyle = "data-ending-style";
		//#endregion
		//#region node_modules/.pnpm/@base-ui+react@1.9.0_@date-fns+tz@1.5.0_@types+react@18.3.31_date-fns@4.4.0_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/react/internals/stateAttributesMapping.mjs
		const STARTING_HOOK = { [startingStyle]: "" };
		const ENDING_HOOK = { [endingStyle]: "" };
		const transitionStatusMapping = { transitionStatus(value) {
			if (value === "starting") return STARTING_HOOK;
			if (value === "ending") return ENDING_HOOK;
			return null;
		} };
		//#endregion
		//#region node_modules/.pnpm/@base-ui+react@1.9.0_@date-fns+tz@1.5.0_@types+react@18.3.31_date-fns@4.4.0_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/react/utils/CommonPopupDataAttributes.mjs
		/**
		* Present when the popup is open.
		*/
		const open = "data-open";
		/**
		* Present when the popup is closed.
		*/
		const closed = "data-closed";
		/**
		* Present when the anchor is hidden.
		*/
		const anchorHidden = "data-anchor-hidden";
		//#endregion
		//#region node_modules/.pnpm/@base-ui+react@1.9.0_@date-fns+tz@1.5.0_@types+react@18.3.31_date-fns@4.4.0_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/react/utils/popupStateMapping.mjs
		const TRIGGER_HOOK = { ["data-popup-open"]: "" };
		const POPUP_OPEN_HOOK = { [open]: "" };
		const POPUP_CLOSED_HOOK = { [closed]: "" };
		const ANCHOR_HIDDEN_HOOK = { [anchorHidden]: "" };
		const triggerOpenStateMapping = { open(value) {
			if (value) return TRIGGER_HOOK;
			return null;
		} };
		const popupStateMapping = {
			open(value) {
				if (value) return POPUP_OPEN_HOOK;
				return POPUP_CLOSED_HOOK;
			},
			anchorHidden(value) {
				if (value) return ANCHOR_HIDDEN_HOOK;
				return null;
			}
		};
		const popupTransitionStateMapping = {
			...popupStateMapping,
			...transitionStatusMapping
		};
		/**
		* Present when the trigger is disabled, either by the `disabled` prop or by a parent `<Tooltip.Root>` component.
		*/
		const triggerDisabled = "data-trigger-disabled";
		//#endregion
		//#region node_modules/.pnpm/@base-ui+react@1.9.0_@date-fns+tz@1.5.0_@types+react@18.3.31_date-fns@4.4.0_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/react/floating-ui-react/utils/element.mjs
		function isTargetInsideEnabledTrigger(target, triggerElements) {
			if (!isElement(target)) return false;
			const targetElement = target;
			if (triggerElements.hasElement(targetElement)) return !targetElement.hasAttribute(triggerDisabled);
			for (const [, trigger] of triggerElements.entries()) if (contains(trigger, targetElement)) return !trigger.hasAttribute(triggerDisabled);
			return false;
		}
		function isEventTargetWithin(event, node) {
			if (node == null) return false;
			if ("composedPath" in event) return event.composedPath().includes(node);
			const eventAgain = event;
			return eventAgain.target != null && node.contains(eventAgain.target);
		}
		function isRootElement(element) {
			return element.matches("html,body");
		}
		function isTypeableElement(element) {
			return isHTMLElement(element) && element.matches("input:not([type='hidden']):not([disabled]),[contenteditable]:not([contenteditable='false']),textarea:not([disabled])");
		}
		function isInteractiveElement(element) {
			return closest(element, `button,a[href],[role="button"],select,[tabindex]:not([tabindex="-1"]),${TYPEABLE_SELECTOR}`) != null;
		}
		function isTypeableCombobox(element) {
			if (!element) return false;
			return element.getAttribute("role") === "combobox" && isTypeableElement(element);
		}
		function matchesFocusVisible(element) {
			if (!element || jsdom) return true;
			try {
				return element.matches(":focus-visible");
			} catch (_e) {
				return true;
			}
		}
		function getFloatingFocusElement(floatingElement) {
			if (!floatingElement) return null;
			return floatingElement.hasAttribute("data-base-ui-focusable") ? floatingElement : floatingElement.querySelector(`[data-base-ui-focusable]`) || floatingElement;
		}
		//#endregion
		//#region node_modules/.pnpm/@base-ui+react@1.9.0_@date-fns+tz@1.5.0_@types+react@18.3.31_date-fns@4.4.0_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/react/floating-ui-react/hooks/useHoverShared.mjs
		function resolveValue(value, pointerType) {
			if (pointerType != null && !isMouseLikePointerType(pointerType)) return 0;
			if (typeof value === "function") return value();
			return value;
		}
		function getDelay(value, prop, pointerType) {
			const result = resolveValue(value, pointerType);
			if (typeof result === "number") return result;
			return result?.[prop];
		}
		function getRestMs(value) {
			if (typeof value === "function") return value();
			return value;
		}
		function isClickLikeOpenEvent(openEventType, interactedInside) {
			return interactedInside || openEventType === "click" || openEventType === "mousedown";
		}
		function isHoverOpenEvent(openEventType) {
			return openEventType?.includes("mouse") && openEventType !== "mousedown";
		}
		//#endregion
		//#region node_modules/.pnpm/@base-ui+react@1.9.0_@date-fns+tz@1.5.0_@types+react@18.3.31_date-fns@4.4.0_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/react/internals/createBaseUIEventDetails.mjs
		/**
		* Maps a change `reason` string to the corresponding native event type.
		*/
		/**
		* Details of custom change events emitted by Base UI components.
		*/
		/**
		* Details of custom generic events emitted by Base UI components.
		*/
		/** Highlight navigation uses mouse events for hover and pointer events for leaving an item. */
		/**
		* Creates a Base UI event details object with the given reason and utilities
		* for preventing Base UI's internal event handling.
		*/
		function createChangeEventDetails(reason, event, trigger, customProperties) {
			let canceled = false;
			let allowPropagation = false;
			const custom = customProperties ?? EMPTY_OBJECT;
			return {
				reason,
				event: event ?? new Event("base-ui"),
				cancel() {
					canceled = true;
				},
				allowPropagation() {
					allowPropagation = true;
				},
				get isCanceled() {
					return canceled;
				},
				get isPropagationAllowed() {
					return allowPropagation;
				},
				trigger,
				...custom
			};
		}
		function createGenericEventDetails(reason, event, customProperties) {
			const custom = customProperties ?? EMPTY_OBJECT;
			return {
				reason,
				event: event ?? new Event("base-ui"),
				...custom
			};
		}
		//#endregion
		//#region node_modules/.pnpm/@base-ui+react@1.9.0_@date-fns+tz@1.5.0_@types+react@18.3.31_date-fns@4.4.0_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/react/internals/reason-parts.mjs
		const none = "none";
		const triggerPress = "trigger-press";
		const triggerHover = "trigger-hover";
		const triggerFocus = "trigger-focus";
		const outsidePress = "outside-press";
		const itemPress = "item-press";
		const focusOut = "focus-out";
		const escapeKey = "escape-key";
		const listNavigation = "list-navigation";
		const keyboard = "keyboard";
		const pointer = "pointer";
		const siblingOpen = "sibling-open";
		const disabled = "disabled";
		const imperativeAction = "imperative-action";
		//#endregion
		//#region node_modules/.pnpm/@base-ui+react@1.9.0_@date-fns+tz@1.5.0_@types+react@18.3.31_date-fns@4.4.0_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/react/floating-ui-react/components/FloatingDelayGroup.mjs
		const FloatingDelayGroupContext = /*#__PURE__*/ react.createContext({
			hasProvider: false,
			timeoutMs: 0,
			delayRef: { current: 0 },
			initialDelayRef: { current: 0 },
			timeout: new Timeout(),
			currentIdRef: { current: null },
			currentContextRef: { current: null }
		});
		function resetDelayRef(delayRef, initialDelayRef) {
			delayRef.current = initialDelayRef.current;
		}
		/**
		* Enables grouping when called inside a component that's a child of a
		* `FloatingDelayGroup`.
		* @see https://floating-ui.com/docs/FloatingDelayGroup
		* @internal
		*/
		function useDelayGroup(store, options = { open: false }) {
			const { open } = options;
			const floatingId = store.useState("floatingId");
			const { currentIdRef, delayRef, timeoutMs, initialDelayRef, currentContextRef, hasProvider, timeout } = react.useContext(FloatingDelayGroupContext);
			const [isInstantPhase, setIsInstantPhase] = react.useState(false);
			const openRef = react.useRef(open);
			useIsoLayoutEffect(() => {
				openRef.current = open;
			}, [open]);
			useIsoLayoutEffect(() => {
				function unset() {
					currentContextRef.current?.setIsInstantPhase(false);
					currentIdRef.current = null;
					currentContextRef.current = null;
					delayRef.current = initialDelayRef.current;
					timeout.clear();
				}
				if (!currentIdRef.current) return;
				if (!open && currentIdRef.current === floatingId) {
					setIsInstantPhase(false);
					if (timeoutMs) {
						const closingId = floatingId;
						timeout.start(timeoutMs, () => {
							if (store.select("open") || currentIdRef.current && currentIdRef.current !== closingId) return;
							unset();
						});
						return () => {
							if (openRef.current || currentIdRef.current !== closingId) timeout.clear();
						};
					}
					unset();
				}
			}, [
				open,
				floatingId,
				currentIdRef,
				delayRef,
				timeoutMs,
				initialDelayRef,
				currentContextRef,
				timeout,
				store
			]);
			useIsoLayoutEffect(() => {
				if (!open) return;
				const prevContext = currentContextRef.current;
				const prevId = currentIdRef.current;
				timeout.clear();
				currentContextRef.current = {
					onOpenChange: store.setOpen,
					setIsInstantPhase
				};
				currentIdRef.current = floatingId;
				delayRef.current = {
					open: 0,
					close: getDelay(initialDelayRef.current, "close")
				};
				if (prevId !== null && prevId !== floatingId) {
					setIsInstantPhase(true);
					prevContext?.setIsInstantPhase(true);
					prevContext?.onOpenChange(false, createChangeEventDetails(none));
				} else {
					setIsInstantPhase(false);
					prevContext?.setIsInstantPhase(false);
				}
			}, [
				open,
				floatingId,
				store,
				currentIdRef,
				delayRef,
				initialDelayRef,
				currentContextRef,
				timeout
			]);
			useIsoLayoutEffect(() => {
				return () => {
					if (currentIdRef.current === floatingId) {
						currentContextRef.current = null;
						if (!openRef.current) return;
						currentIdRef.current = null;
						resetDelayRef(delayRef, initialDelayRef);
						timeout.clear();
					}
				};
			}, [
				currentContextRef,
				currentIdRef,
				delayRef,
				floatingId,
				initialDelayRef,
				timeout
			]);
			return react.useMemo(() => ({
				activeIdRef: currentIdRef,
				hasProvider,
				delayRef,
				isInstantPhase
			}), [
				currentIdRef,
				hasProvider,
				delayRef,
				isInstantPhase
			]);
		}
		//#endregion
		//#region node_modules/.pnpm/@base-ui+utils@0.5.0_@types+react@18.3.31_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/utils/addEventListener.mjs
		/**
		* Adds an event listener and returns a cleanup function to remove it.
		*/
		function addEventListener(target, type, listener, options) {
			target.addEventListener(type, listener, options);
			return () => {
				target.removeEventListener(type, listener, options);
			};
		}
		//#endregion
		//#region node_modules/.pnpm/@base-ui+utils@0.5.0_@types+react@18.3.31_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/utils/mergeCleanups.mjs
		/**
		* Combines multiple cleanup functions into a single cleanup function.
		*/
		function mergeCleanups(...cleanups) {
			return () => {
				for (let i = 0; i < cleanups.length; i += 1) {
					const cleanup = cleanups[i];
					if (cleanup) cleanup();
				}
			};
		}
		//#endregion
		//#region node_modules/.pnpm/@base-ui+utils@0.5.0_@types+react@18.3.31_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/utils/useMergedRefs.mjs
		/**
		* Merges refs into a single memoized callback ref or `null`.
		* This makes sure multiple refs are updated together and have the same value.
		*
		* This function accepts up to four refs. If you need to merge more, or have an unspecified number of refs to merge,
		* use `useMergedRefsN` instead.
		*/
		function useMergedRefs(a, b, c, d) {
			const forkRef = useRefWithInit(createForkRef).current;
			if (didChange(forkRef, a, b, c, d)) update(forkRef, [
				a,
				b,
				c,
				d
			]);
			return forkRef.callback;
		}
		/**
		* Merges an array of refs into a single memoized callback ref or `null`.
		*
		* If you need to merge a fixed number (up to four) of refs, use `useMergedRefs` instead for better performance.
		*/
		function useMergedRefsN(refs) {
			const forkRef = useRefWithInit(createForkRef).current;
			if (didChangeN(forkRef, refs)) update(forkRef, refs);
			return forkRef.callback;
		}
		function createForkRef() {
			return {
				callback: null,
				cleanup: null,
				refs: []
			};
		}
		function didChange(forkRef, a, b, c, d) {
			return forkRef.refs[0] !== a || forkRef.refs[1] !== b || forkRef.refs[2] !== c || forkRef.refs[3] !== d;
		}
		function didChangeN(forkRef, newRefs) {
			return forkRef.refs.length !== newRefs.length || forkRef.refs.some((ref, index) => ref !== newRefs[index]);
		}
		function update(forkRef, refs) {
			forkRef.refs = refs;
			if (refs.every((ref) => ref == null)) {
				forkRef.callback = null;
				return;
			}
			forkRef.callback = (instance) => {
				if (forkRef.cleanup) {
					forkRef.cleanup();
					forkRef.cleanup = null;
				}
				if (instance != null) {
					const cleanupCallbacks = Array(refs.length).fill(null);
					for (let i = 0; i < refs.length; i += 1) {
						const ref = refs[i];
						if (ref == null) continue;
						switch (typeof ref) {
							case "function": {
								const refCleanup = ref(instance);
								if (typeof refCleanup === "function") cleanupCallbacks[i] = refCleanup;
								break;
							}
							case "object": ref.current = instance;
						}
					}
					forkRef.cleanup = () => {
						for (let i = 0; i < refs.length; i += 1) {
							const ref = refs[i];
							if (ref == null) continue;
							switch (typeof ref) {
								case "function": {
									const cleanupCallback = cleanupCallbacks[i];
									if (typeof cleanupCallback === "function") cleanupCallback();
									else ref(null);
									break;
								}
								case "object": ref.current = null;
							}
						}
					};
				}
			};
		}
		//#endregion
		//#region node_modules/.pnpm/@base-ui+utils@0.5.0_@types+react@18.3.31_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/utils/useValueAsRef.mjs
		/**
		* Untracks the provided value by turning it into a ref to remove its reactivity.
		*
		* Used to access the passed value inside `React.useEffect` without causing the effect to re-run when the value changes.
		*/
		function useValueAsRef(value) {
			const latest = useRefWithInit(createLatestRef, value).current;
			latest.next = value;
			useIsoLayoutEffect(latest.effect);
			return latest;
		}
		function createLatestRef(value) {
			const latest = {
				current: value,
				next: value,
				effect: () => {
					latest.current = latest.next;
				}
			};
			return latest;
		}
		//#endregion
		//#region node_modules/.pnpm/@base-ui+utils@0.5.0_@types+react@18.3.31_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/utils/safeReact.mjs
		/**
		* A clone of the React namespace for reading APIs that may be missing in older
		* supported React versions. Bundlers can rewrite direct `React.someNewApi`
		* reads into named imports, which breaks React 17. Reading from this cloned
		* object keeps those lookups optional.
		*
		* @see https://github.com/mui/material-ui/issues/41190#issuecomment-2040873379
		*/
		const SafeReact = { ...react };
		//#endregion
		//#region node_modules/.pnpm/@base-ui+utils@0.5.0_@types+react@18.3.31_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/utils/useStableCallback.mjs
		const useInsertionEffect = SafeReact.useInsertionEffect;
		const useSafeInsertionEffect = useInsertionEffect && useInsertionEffect !== SafeReact.useLayoutEffect ? useInsertionEffect : (fn) => fn();
		/**
		* Stabilizes the function passed so it's always the same between renders.
		*
		* The function becomes non-reactive to any values it captures.
		* It can safely be passed as a dependency of `React.useMemo` and `React.useEffect` without re-triggering them if its captured values change.
		*
		* The function must only be called inside effects and event handlers, never during render (which throws an error).
		*
		* This hook is a more permissive version of React 19.2's `React.useEffectEvent` in that it can be passed through contexts and called in event handler props, not just effects.
		*/
		function useStableCallback(callback) {
			const stable = useRefWithInit(createStableCallback).current;
			stable.next = callback;
			useSafeInsertionEffect(stable.effect);
			return stable.trampoline;
		}
		function createStableCallback() {
			const stable = {
				next: void 0,
				callback: assertNotCalled,
				trampoline: (...args) => stable.callback?.(...args),
				effect: () => {
					stable.callback = stable.next;
				}
			};
			return stable;
		}
		function assertNotCalled() {}
		//#endregion
		//#region node_modules/.pnpm/@base-ui+utils@0.5.0_@types+react@18.3.31_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/utils/useAnimationFrame.mjs
		/** Unlike `setTimeout`, rAF doesn't guarantee a positive integer return value, so we can't have
		* a monomorphic `uint` type with `0` meaning empty.
		* See warning note at:
		* https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame#return_value */
		const EMPTY = null;
		globalThis.requestAnimationFrame;
		var Scheduler = class {
			callbacks = [];
			callbacksCount = 0;
			nextId = 1;
			startId = 1;
			isScheduled = false;
			tick = (timestamp) => {
				this.isScheduled = false;
				const currentCallbacks = this.callbacks;
				const currentCallbacksCount = this.callbacksCount;
				this.callbacks = [];
				this.callbacksCount = 0;
				this.startId = this.nextId;
				if (currentCallbacksCount > 0) for (let i = 0; i < currentCallbacks.length; i += 1) currentCallbacks[i]?.(timestamp);
			};
			request(fn) {
				const id = this.nextId;
				this.nextId += 1;
				this.callbacks.push(fn);
				this.callbacksCount += 1;
				if (!this.isScheduled || false) {
					requestAnimationFrame(this.tick);
					this.isScheduled = true;
				}
				return id;
			}
			cancel(id) {
				const index = id - this.startId;
				if (index < 0 || index >= this.callbacks.length) return;
				if (this.callbacks[index] === null) return;
				this.callbacks[index] = null;
				this.callbacksCount -= 1;
			}
		};
		let scheduler = new Scheduler();
		var AnimationFrame = class AnimationFrame {
			static create() {
				return new AnimationFrame();
			}
			static request(fn) {
				return scheduler.request(fn);
			}
			static cancel(id) {
				return scheduler.cancel(id);
			}
			currentId = EMPTY;
			/**
			* Executes `fn` after `delay`, clearing any previously scheduled call.
			*/
			request(fn) {
				this.cancel();
				this.currentId = scheduler.request(() => {
					this.currentId = EMPTY;
					fn();
				});
			}
			cancel = () => {
				if (this.currentId !== EMPTY) {
					scheduler.cancel(this.currentId);
					this.currentId = EMPTY;
				}
			};
			disposeEffect = () => {
				return this.cancel;
			};
		};
		/**
		* A `requestAnimationFrame` with automatic cleanup and guard.
		*/
		function useAnimationFrame() {
			const timeout = useRefWithInit(AnimationFrame.create).current;
			useOnMount(timeout.disposeEffect);
			return timeout;
		}
		//#endregion
		//#region node_modules/.pnpm/@base-ui+utils@0.5.0_@types+react@18.3.31_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/utils/owner.mjs
		function ownerDocument(node) {
			return node?.ownerDocument || document;
		}
		//#endregion
		//#region node_modules/.pnpm/@base-ui+utils@0.5.0_@types+react@18.3.31_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/utils/visuallyHidden.mjs
		const visuallyHiddenBase = {
			clipPath: "inset(50%)",
			overflow: "hidden",
			whiteSpace: "nowrap",
			border: 0,
			padding: 0,
			width: 1,
			height: 1,
			margin: -1
		};
		const visuallyHidden = {
			...visuallyHiddenBase,
			position: "fixed",
			margin: 0,
			top: 0,
			left: 0
		};
		({ ...visuallyHiddenBase });
		//#endregion
		//#region node_modules/.pnpm/@base-ui+react@1.9.0_@date-fns+tz@1.5.0_@types+react@18.3.31_date-fns@4.4.0_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/react/utils/FocusGuard.mjs
		/**
		* @internal
		*/
		const FocusGuard = /*#__PURE__*/ react.forwardRef(function FocusGuard(props, ref) {
			const [role, setRole] = react.useState();
			useIsoLayoutEffect(() => {
				if (voiceOver && webkit) setRole("button");
			}, []);
			const restProps = {
				tabIndex: 0,
				role
			};
			return /*#__PURE__*/ (0, react_jsx_runtime.jsx)("span", {
				...props,
				ref,
				style: visuallyHidden,
				"aria-hidden": role ? void 0 : true,
				...restProps,
				"data-base-ui-focus-guard": ""
			});
		});
		//#endregion
		//#region node_modules/.pnpm/@floating-ui+utils@0.2.12/node_modules/@floating-ui/utils/dist/floating-ui.utils.mjs
		const min = Math.min;
		const max = Math.max;
		const round = Math.round;
		const floor = Math.floor;
		const createCoords = (v) => ({
			x: v,
			y: v
		});
		const oppositeSideMap = {
			left: "right",
			right: "left",
			bottom: "top",
			top: "bottom"
		};
		function clamp(start, value, end) {
			return max(start, min(value, end));
		}
		function evaluate(value, param) {
			return typeof value === "function" ? value(param) : value;
		}
		function getSide(placement) {
			return placement.split("-")[0];
		}
		function getAlignment(placement) {
			return placement.split("-")[1];
		}
		function getOppositeAxis(axis) {
			return axis === "x" ? "y" : "x";
		}
		function getAxisLength(axis) {
			return axis === "y" ? "height" : "width";
		}
		function getSideAxis(placement) {
			const firstChar = placement[0];
			return firstChar === "t" || firstChar === "b" ? "y" : "x";
		}
		function getAlignmentAxis(placement) {
			return getOppositeAxis(getSideAxis(placement));
		}
		function getAlignmentSides(placement, rects, rtl) {
			if (rtl === void 0) rtl = false;
			const alignment = getAlignment(placement);
			const alignmentAxis = getAlignmentAxis(placement);
			const length = getAxisLength(alignmentAxis);
			let mainAlignmentSide = alignmentAxis === "x" ? alignment === (rtl ? "end" : "start") ? "right" : "left" : alignment === "start" ? "bottom" : "top";
			if (rects.reference[length] > rects.floating[length]) mainAlignmentSide = getOppositePlacement(mainAlignmentSide);
			return [mainAlignmentSide, getOppositePlacement(mainAlignmentSide)];
		}
		function getExpandedPlacements(placement) {
			const oppositePlacement = getOppositePlacement(placement);
			return [
				getOppositeAlignmentPlacement(placement),
				oppositePlacement,
				getOppositeAlignmentPlacement(oppositePlacement)
			];
		}
		function getOppositeAlignmentPlacement(placement) {
			return placement.includes("start") ? placement.replace("start", "end") : placement.replace("end", "start");
		}
		const lrPlacement = ["left", "right"];
		const rlPlacement = ["right", "left"];
		const tbPlacement = ["top", "bottom"];
		const btPlacement = ["bottom", "top"];
		function getSideList(side, isStart, rtl) {
			switch (side) {
				case "top":
				case "bottom":
					if (rtl) return isStart ? rlPlacement : lrPlacement;
					return isStart ? lrPlacement : rlPlacement;
				case "left":
				case "right": return isStart ? tbPlacement : btPlacement;
				default: return [];
			}
		}
		function getOppositeAxisPlacements(placement, flipAlignment, direction, rtl) {
			const alignment = getAlignment(placement);
			let list = getSideList(getSide(placement), direction === "start", rtl);
			if (alignment) {
				list = list.map((side) => side + "-" + alignment);
				if (flipAlignment) list = list.concat(list.map(getOppositeAlignmentPlacement));
			}
			return list;
		}
		function getOppositePlacement(placement) {
			const side = getSide(placement);
			return oppositeSideMap[side] + placement.slice(side.length);
		}
		function expandPaddingObject(padding) {
			var _padding$top, _padding$right, _padding$bottom, _padding$left;
			return {
				top: (_padding$top = padding.top) != null ? _padding$top : 0,
				right: (_padding$right = padding.right) != null ? _padding$right : 0,
				bottom: (_padding$bottom = padding.bottom) != null ? _padding$bottom : 0,
				left: (_padding$left = padding.left) != null ? _padding$left : 0
			};
		}
		function getPaddingObject(padding) {
			return typeof padding !== "number" ? expandPaddingObject(padding) : {
				top: padding,
				right: padding,
				bottom: padding,
				left: padding
			};
		}
		function rectToClientRect(rect) {
			const { x, y, width, height } = rect;
			return {
				width,
				height,
				top: y,
				left: x,
				right: x + width,
				bottom: y + height,
				x,
				y
			};
		}
		//#endregion
		//#region node_modules/.pnpm/@base-ui+react@1.9.0_@date-fns+tz@1.5.0_@types+react@18.3.31_date-fns@4.4.0_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/react/floating-ui-react/utils/composite.mjs
		function isIndexOutOfListBounds(list, index) {
			return index < 0 || index >= list.length;
		}
		function getMinListIndex(listRef, disabledIndices) {
			return findNonDisabledListIndex(listRef.current, { disabledIndices });
		}
		function getMaxListIndex(listRef, disabledIndices) {
			return findNonDisabledListIndex(listRef.current, {
				decrement: true,
				startingIndex: listRef.current.length,
				disabledIndices
			});
		}
		/**
		* The index one arrow step moves the highlight to from `currentIndex`, or `-1` when the step
		* leaves the list. `wrapped` reports a jump from one end of the list to the other.
		*/
		function getNextListIndex(list, currentIndex, options) {
			const { decrement, loopFocus, allowEscape, disabledIndices, minIndex, maxIndex } = options;
			const step = () => findNonDisabledListIndex(list, {
				startingIndex: currentIndex,
				decrement,
				disabledIndices
			});
			let index;
			let wrapped = false;
			if (!loopFocus) index = decrement ? Math.max(minIndex, step()) : Math.min(maxIndex, step());
			else if (decrement ? currentIndex <= minIndex : currentIndex >= maxIndex) {
				const outside = decrement ? -1 : list.length;
				if (allowEscape && currentIndex !== outside) index = -1;
				else {
					index = decrement ? maxIndex : minIndex;
					wrapped = true;
				}
			} else index = step();
			return {
				index: isIndexOutOfListBounds(list, index) ? -1 : index,
				wrapped
			};
		}
		function findNonDisabledListIndex(list, { startingIndex = -1, decrement = false, disabledIndices, amount = 1 } = {}) {
			let index = startingIndex;
			do
				index += decrement ? -amount : amount;
			while (index >= 0 && index <= list.length - 1 && isListIndexDisabled(list, index, disabledIndices));
			return index;
		}
		function isListIndexDisabled(list, index, disabledIndices) {
			if (typeof disabledIndices === "function" ? disabledIndices(index) : disabledIndices?.includes(index) ?? false) return true;
			const element = list[index];
			if (!element) return false;
			if (!isElementVisible(element)) return true;
			if (element.matches(":disabled")) return true;
			return !disabledIndices && (element.hasAttribute("disabled") || element.getAttribute("aria-disabled") === "true");
		}
		function isHiddenByStyles(styles) {
			return styles.visibility === "hidden" || styles.visibility === "collapse";
		}
		function isElementVisible(element, styles = element ? getComputedStyle$1(element) : null) {
			if (!element || !element.isConnected || !styles || isHiddenByStyles(styles)) return false;
			if (typeof element.checkVisibility === "function") return element.checkVisibility();
			return styles.display !== "none" && styles.display !== "contents";
		}
		//#endregion
		//#region node_modules/.pnpm/@base-ui+react@1.9.0_@date-fns+tz@1.5.0_@types+react@18.3.31_date-fns@4.4.0_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/react/floating-ui-react/utils/tabbable.mjs
		const CANDIDATE_SELECTOR = "a[href],button,input,select,textarea,summary,details,iframe,object,embed,[tabindex],[contenteditable]:not([contenteditable=\"false\"]),audio[controls],video[controls]";
		function getParentElement(element) {
			const assignedSlot = element.assignedSlot;
			if (assignedSlot) return assignedSlot;
			if (element.parentElement) return element.parentElement;
			const rootNode = element.getRootNode();
			return isShadowRoot(rootNode) ? rootNode.host : null;
		}
		function getDetailsSummary(details) {
			for (const child of Array.from(details.children)) if (getNodeName(child) === "summary") return child;
			return null;
		}
		function isWithinOpenDetailsSummary(element, details) {
			const summary = getDetailsSummary(details);
			return !!summary && (element === summary || contains(summary, element));
		}
		function isFocusableCandidate(element) {
			const nodeName = element ? getNodeName(element) : "";
			return element != null && element.matches(CANDIDATE_SELECTOR) && (nodeName !== "summary" || element.parentElement != null && getNodeName(element.parentElement) === "details" && getDetailsSummary(element.parentElement) === element) && (nodeName !== "details" || getDetailsSummary(element) == null) && (nodeName !== "input" || element.type !== "hidden");
		}
		function isFocusableElement(element) {
			if (!isFocusableCandidate(element) || !element.isConnected || element.matches(":disabled")) return false;
			for (let current = element; current; current = getParentElement(current)) {
				const isAncestor = current !== element;
				const isSlot = getNodeName(current) === "slot";
				if (current.hasAttribute("inert")) return false;
				if (isAncestor && getNodeName(current) === "details" && !current.open && !isWithinOpenDetailsSummary(element, current) || current.hasAttribute("hidden") || !isSlot && !isVisibleInTabbableTree(current, isAncestor)) return false;
			}
			return true;
		}
		function isVisibleInTabbableTree(element, isAncestor) {
			const styles = getComputedStyle$1(element);
			if (!isAncestor) return isElementVisible(element, styles);
			return styles.display !== "none";
		}
		function getTabIndex(element) {
			const tabIndex = element.tabIndex;
			if (tabIndex < 0) {
				const nodeName = getNodeName(element);
				if (nodeName === "details" || nodeName === "audio" || nodeName === "video" || isHTMLElement(element) && element.isContentEditable) return 0;
			}
			return tabIndex;
		}
		function getNamedRadioInput(element) {
			if (getNodeName(element) !== "input") return null;
			const input = element;
			return input.type === "radio" && input.name !== "" ? input : null;
		}
		function isTabbableRadio(element, candidates) {
			const input = getNamedRadioInput(element);
			if (!input) return true;
			const checkedRadio = candidates.find((candidate) => {
				const radio = getNamedRadioInput(candidate);
				return radio?.name === input.name && radio.form === input.form && radio.checked;
			});
			if (checkedRadio) return checkedRadio === input;
			return candidates.find((candidate) => {
				const radio = getNamedRadioInput(candidate);
				return radio?.name === input.name && radio.form === input.form;
			}) === input;
		}
		function getComposedChildren(container) {
			if (isHTMLElement(container) && getNodeName(container) === "slot") {
				const assignedElements = container.assignedElements({ flatten: true });
				if (assignedElements.length > 0) return assignedElements;
			}
			if (isHTMLElement(container) && container.shadowRoot) return Array.from(container.shadowRoot.children);
			return Array.from(container.children);
		}
		function appendCandidates(container, list) {
			getComposedChildren(container).forEach((child) => {
				if (isFocusableCandidate(child)) list.push(child);
				appendCandidates(child, list);
			});
		}
		function appendMatchingElements(container, selector, list) {
			getComposedChildren(container).forEach((child) => {
				if (isHTMLElement(child) && child.matches(selector)) list.push(child);
				appendMatchingElements(child, selector, list);
			});
		}
		function isTabbable(element) {
			return isFocusableElement(element) && getTabIndex(element) >= 0;
		}
		function focusable(container) {
			const candidates = [];
			appendCandidates(container, candidates);
			return candidates.filter(isFocusableElement);
		}
		function tabbable(container) {
			const candidates = focusable(container);
			return candidates.filter((element) => getTabIndex(element) >= 0 && isTabbableRadio(element, candidates));
		}
		function getTabbableIn(container, dir) {
			const list = tabbable(container);
			const len = list.length;
			if (len === 0) return;
			const active = activeElement(ownerDocument(container));
			const index = list.indexOf(active);
			return list[index === -1 ? dir === 1 ? 0 : len - 1 : index + dir];
		}
		function getNextTabbable(referenceElement) {
			return getTabbableIn(ownerDocument(referenceElement).body, 1) || referenceElement;
		}
		function getPreviousTabbable(referenceElement) {
			return getTabbableIn(ownerDocument(referenceElement).body, -1) || referenceElement;
		}
		function isOutsideEvent(event, container) {
			const containerElement = container || event.currentTarget;
			const relatedTarget = event.relatedTarget;
			return !relatedTarget || !contains(containerElement, relatedTarget);
		}
		function disableFocusInside(container) {
			tabbable(container).forEach((element) => {
				element.dataset.tabindex = element.getAttribute("tabindex") || "";
				element.setAttribute("tabindex", "-1");
			});
		}
		function enableFocusInside(container) {
			const elements = [];
			appendMatchingElements(container, "[data-tabindex]", elements);
			elements.forEach((element) => {
				const tabindex = element.dataset.tabindex;
				delete element.dataset.tabindex;
				if (tabindex) element.setAttribute("tabindex", tabindex);
				else element.removeAttribute("tabindex");
			});
		}
		//#endregion
		//#region node_modules/.pnpm/@base-ui+react@1.9.0_@date-fns+tz@1.5.0_@types+react@18.3.31_date-fns@4.4.0_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/react/floating-ui-react/utils/nodes.mjs
		function getNodeChildren(nodes, id, onlyOpenChildren = true) {
			return nodes.filter((node) => node.parentId === id).flatMap((child) => [...!onlyOpenChildren || child.context?.open ? [child] : [], ...getNodeChildren(nodes, child.id, onlyOpenChildren)]);
		}
		function getNodeAncestors(nodes, id) {
			let allAncestors = [];
			let currentParentId = nodes.find((node) => node.id === id)?.parentId;
			while (currentParentId) {
				const currentNode = nodes.find((node) => node.id === currentParentId);
				currentParentId = currentNode?.parentId;
				if (currentNode) allAncestors = allAncestors.concat(currentNode);
			}
			return allAncestors;
		}
		//#endregion
		//#region node_modules/.pnpm/@base-ui+react@1.9.0_@date-fns+tz@1.5.0_@types+react@18.3.31_date-fns@4.4.0_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/react/floating-ui-react/utils/createAttribute.mjs
		function createAttribute(name) {
			return `data-base-ui-${name}`;
		}
		//#endregion
		//#region node_modules/.pnpm/@base-ui+react@1.9.0_@date-fns+tz@1.5.0_@types+react@18.3.31_date-fns@4.4.0_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/react/floating-ui-react/utils/enqueueFocus.mjs
		let rafId = 0;
		function enqueueFocus(el, options = {}) {
			const { preventScroll = false, sync = false, shouldFocus } = options;
			cancelAnimationFrame(rafId);
			function exec() {
				if (shouldFocus && !shouldFocus()) return;
				el?.focus({ preventScroll });
			}
			if (sync) {
				exec();
				return NOOP;
			}
			const currentRafId = requestAnimationFrame(exec);
			rafId = currentRafId;
			return () => {
				if (rafId === currentRafId) {
					cancelAnimationFrame(currentRafId);
					rafId = 0;
				}
			};
		}
		//#endregion
		//#region node_modules/.pnpm/@base-ui+react@1.9.0_@date-fns+tz@1.5.0_@types+react@18.3.31_date-fns@4.4.0_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/react/floating-ui-react/utils/markOthers.mjs
		const markerName = "data-base-ui-inert";
		let ariaHiddenCounterMap = /* @__PURE__ */ new WeakMap();
		let uncontrolledElementsSet = /* @__PURE__ */ new WeakSet();
		let markerCounterMap = /* @__PURE__ */ new WeakMap();
		let lockCount = 0;
		function unwrapHost(node) {
			if (!node) return null;
			return isShadowRoot(node) ? node.host : unwrapHost(node.parentNode);
		}
		const correctElements = (parent, targets) => targets.map((target) => {
			if (parent.contains(target)) return target;
			const correctedTarget = unwrapHost(target);
			if (parent.contains(correctedTarget)) return correctedTarget;
			return null;
		}).filter((x) => x != null);
		const buildKeepSet = (targets) => {
			const keep = /* @__PURE__ */ new Set();
			targets.forEach((target) => {
				let node = target;
				while (node && !keep.has(node)) {
					keep.add(node);
					node = node.parentNode;
				}
			});
			return keep;
		};
		const collectOutsideElements = (root, keepElements, stopElements) => {
			const outside = [];
			const walk = (parent) => {
				if (!parent || stopElements.has(parent)) return;
				Array.from(parent.children).forEach((node) => {
					if (getNodeName(node) === "script") return;
					if (keepElements.has(node)) walk(node);
					else outside.push(node);
				});
			};
			walk(root);
			return outside;
		};
		function applyAttributeToOthers(uncorrectedAvoidElements, body, ariaHidden, { mark = true }) {
			const avoidElements = correctElements(body, uncorrectedAvoidElements);
			const markerTargets = mark ? collectOutsideElements(body, buildKeepSet(avoidElements), new Set(avoidElements)) : [];
			const hiddenElements = [];
			const markedElements = [];
			if (ariaHidden) {
				const ariaLiveElements = correctElements(body, Array.from(body.querySelectorAll("[aria-live]")));
				const controlElements = avoidElements.concat(ariaLiveElements);
				collectOutsideElements(body, buildKeepSet(controlElements), new Set(controlElements)).forEach((node) => {
					const attr = node.getAttribute("aria-hidden");
					const alreadyHidden = attr !== null && attr !== "false";
					const counterValue = (ariaHiddenCounterMap.get(node) || 0) + 1;
					ariaHiddenCounterMap.set(node, counterValue);
					hiddenElements.push(node);
					if (counterValue === 1 && alreadyHidden) uncontrolledElementsSet.add(node);
					if (!alreadyHidden) node.setAttribute("aria-hidden", "true");
				});
			}
			if (mark) markerTargets.forEach((node) => {
				const markerValue = (markerCounterMap.get(node) || 0) + 1;
				markerCounterMap.set(node, markerValue);
				markedElements.push(node);
				if (markerValue === 1) node.setAttribute(markerName, "");
			});
			lockCount += 1;
			return () => {
				hiddenElements.forEach((element) => {
					const counterValue = (ariaHiddenCounterMap.get(element) || 0) - 1;
					ariaHiddenCounterMap.set(element, counterValue);
					if (!counterValue) {
						if (!uncontrolledElementsSet.has(element)) element.removeAttribute("aria-hidden");
						uncontrolledElementsSet.delete(element);
					}
				});
				if (mark) markedElements.forEach((element) => {
					const markerValue = (markerCounterMap.get(element) || 0) - 1;
					markerCounterMap.set(element, markerValue);
					if (!markerValue) element.removeAttribute(markerName);
				});
				lockCount -= 1;
				if (!lockCount) {
					ariaHiddenCounterMap = /* @__PURE__ */ new WeakMap();
					uncontrolledElementsSet = /* @__PURE__ */ new WeakSet();
					markerCounterMap = /* @__PURE__ */ new WeakMap();
				}
			};
		}
		function markOthers(avoidElements, options = {}) {
			const { ariaHidden = false, mark = true } = options;
			const body = ownerDocument(avoidElements[0]).body;
			return applyAttributeToOthers(avoidElements, body, ariaHidden, { mark });
		}
		//#endregion
		//#region node_modules/.pnpm/@base-ui+utils@0.5.0_@types+react@18.3.31_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/utils/useForcedRerendering.mjs
		/**
		* Returns a function that forces a rerender.
		*/
		function useForcedRerendering() {
			const [, setState] = react.useState({});
			return react.useCallback(() => {
				setState({});
			}, []);
		}
		//#endregion
		//#region node_modules/.pnpm/@base-ui+utils@0.5.0_@types+react@18.3.31_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/utils/useId.mjs
		let globalId = 0;
		function useGlobalId(idOverride, prefix = "mui") {
			const defaultId = react.useRef(void 0);
			const forceRerender = useForcedRerendering();
			const id = idOverride ?? defaultId.current;
			react.useEffect(() => {
				if (defaultId.current == null) {
					globalId += 1;
					defaultId.current = `${prefix}-${globalId}`;
					if (idOverride == null) forceRerender();
				}
			}, [
				idOverride,
				prefix,
				forceRerender
			]);
			return id;
		}
		const maybeReactUseId = SafeReact.useId;
		/**
		*
		* @example <div id={useId()} />
		* @param {string | undefined} idOverride overrides the generated id when provided
		* @param {string | undefined} prefix prefixes the generated id when provided
		* @returns {string | undefined}
		*/
		function useId$6(idOverride, prefix) {
			if (maybeReactUseId !== void 0) {
				const reactId = maybeReactUseId();
				return idOverride ?? (prefix ? `${prefix}-${reactId}` : reactId);
			}
			return useGlobalId(idOverride, prefix);
		}
		//#endregion
		//#region node_modules/.pnpm/@base-ui+utils@0.5.0_@types+react@18.3.31_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/utils/reactVersion.mjs
		const majorVersion = parseInt(react.version, 10);
		function isReactVersionAtLeast(reactVersionToCheck) {
			return majorVersion >= reactVersionToCheck;
		}
		//#endregion
		//#region node_modules/.pnpm/@base-ui+utils@0.5.0_@types+react@18.3.31_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/utils/getReactElementRef.mjs
		/**
		* Extracts the `ref` from a React element, handling different React versions.
		*/
		function getReactElementRef(element) {
			if (!/*#__PURE__*/ react.isValidElement(element)) return null;
			const reactElement = element;
			const propsWithRef = reactElement.props;
			return (isReactVersionAtLeast(19) ? propsWithRef?.ref : reactElement.ref) ?? null;
		}
		//#endregion
		//#region node_modules/.pnpm/@base-ui+utils@0.5.0_@types+react@18.3.31_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/utils/mergeObjects.mjs
		function mergeObjects(a, b) {
			if (a && !b) return a;
			if (!a && b) return b;
			if (a || b) return {
				...a,
				...b
			};
		}
		//#endregion
		//#region node_modules/.pnpm/@base-ui+react@1.9.0_@date-fns+tz@1.5.0_@types+react@18.3.31_date-fns@4.4.0_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/react/internals/getStateAttributesProps.mjs
		function getStateAttributesProps(state, customMapping) {
			const props = {};
			for (const key in state) {
				const value = state[key];
				if (customMapping?.hasOwnProperty(key)) {
					const customProps = customMapping[key](value);
					if (customProps != null) Object.assign(props, customProps);
					continue;
				}
				if (value === true) props[`data-${key.toLowerCase()}`] = "";
				else if (value) props[`data-${key.toLowerCase()}`] = value.toString();
			}
			return props;
		}
		//#endregion
		//#region node_modules/.pnpm/@base-ui+react@1.9.0_@date-fns+tz@1.5.0_@types+react@18.3.31_date-fns@4.4.0_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/react/utils/resolveClassName.mjs
		/**
		* If the provided className is a string, it will be returned as is.
		* Otherwise, the function will call the className function with the state as the first argument.
		*
		* @param className
		* @param state
		*/
		function resolveClassName(className, state) {
			return typeof className === "function" ? className(state) : className;
		}
		//#endregion
		//#region node_modules/.pnpm/@base-ui+react@1.9.0_@date-fns+tz@1.5.0_@types+react@18.3.31_date-fns@4.4.0_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/react/utils/resolveStyle.mjs
		/**
		* If the provided style is an object, it will be returned as is.
		* Otherwise, the function will call the style function with the state as the first argument.
		*
		* @param style
		* @param state
		*/
		function resolveStyle(style, state) {
			return typeof style === "function" ? style(state) : style;
		}
		//#endregion
		//#region node_modules/.pnpm/@base-ui+react@1.9.0_@date-fns+tz@1.5.0_@types+react@18.3.31_date-fns@4.4.0_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/react/merge-props/mergeProps.mjs
		const EMPTY_PROPS = {};
		/**
		* Merges multiple sets of React props. It follows the Object.assign pattern where the rightmost object's fields overwrite
		* the conflicting ones from others. This doesn't apply to event handlers, `className` and `style` props.
		*
		* Event handlers are merged and called in right-to-left order (rightmost handler executes first, leftmost last).
		* For React synthetic events, the rightmost handler can prevent prior (left-positioned) handlers from executing
		* by calling `event.preventBaseUIHandler()`. For non-synthetic events (custom events with primitive/object values),
		* all handlers always execute without prevention capability.
		*
		* The `className` prop is merged by concatenating classes in right-to-left order (rightmost class appears first in the string).
		* The `style` prop is merged with rightmost styles overwriting the prior ones.
		*
		* Props can either be provided as objects or as functions that take the previous props as an argument.
		* The function will receive the merged props up to that point (going from left to right):
		* so in the case of `(obj1, obj2, fn, obj3)`, `fn` will receive the merged props of `obj1` and `obj2`.
		* The function is responsible for chaining event handlers if needed (that is, we don't run the merge logic).
		*
		* Event handlers returned by the functions are not automatically prevented when `preventBaseUIHandler` is called.
		* They must check `event.baseUIHandlerPrevented` themselves and bail out if it's true.
		*
		* @important **`ref` is not merged.**
		* @param a Props object to merge.
		* @param b Props object to merge. The function will overwrite conflicting props from `a`.
		* @param c Props object to merge. The function will overwrite conflicting props from previous parameters.
		* @param d Props object to merge. The function will overwrite conflicting props from previous parameters.
		* @param e Props object to merge. The function will overwrite conflicting props from previous parameters.
		* @returns The merged props.
		* @public
		*/
		function mergeProps(a, b, c, d, e) {
			if (!c && !d && !e && !a) return createInitialMergedProps(b);
			let merged = createInitialMergedProps(a);
			if (b) merged = mergeInto(merged, b);
			if (c) merged = mergeInto(merged, c);
			if (d) merged = mergeInto(merged, d);
			if (e) merged = mergeInto(merged, e);
			return merged;
		}
		/**
		* Merges an arbitrary number of React props using the same logic as {@link mergeProps}.
		* This function accepts an array of props instead of individual arguments.
		*
		* This has slightly lower performance than {@link mergeProps} due to accepting an array
		* instead of a fixed number of arguments. Prefer {@link mergeProps} when merging 5 or
		* fewer prop sets for better performance.
		*
		* @param props Array of props to merge.
		* @returns The merged props.
		* @see mergeProps
		* @public
		*/
		function mergePropsN(props) {
			if (props.length === 0) return EMPTY_PROPS;
			if (props.length === 1) return createInitialMergedProps(props[0]);
			let merged = createInitialMergedProps(props[0]);
			for (let i = 1; i < props.length; i += 1) merged = mergeInto(merged, props[i]);
			return merged;
		}
		function createInitialMergedProps(inputProps) {
			if (isPropsGetter(inputProps)) return { ...inputProps(EMPTY_PROPS) };
			return copyInitialProps(inputProps);
		}
		function mergeInto(merged, inputProps) {
			if (isPropsGetter(inputProps)) return inputProps(merged);
			return mutablyMergeInto(merged, inputProps);
		}
		function copyInitialProps(inputProps) {
			const copiedProps = { ...inputProps };
			for (const propName in copiedProps) {
				const propValue = copiedProps[propName];
				if (isEventHandler(propName, propValue)) copiedProps[propName] = wrapEventHandler(propValue);
			}
			return copiedProps;
		}
		/**
		* Merges two sets of props. In case of conflicts, the external props take precedence.
		*/
		function mutablyMergeInto(mergedProps, externalProps) {
			if (!externalProps) return mergedProps;
			for (const propName in externalProps) {
				const externalPropValue = externalProps[propName];
				switch (propName) {
					case "style":
						mergedProps[propName] = mergeObjects(mergedProps.style, externalPropValue);
						break;
					case "className":
						mergedProps[propName] = mergeClassNames(mergedProps.className, externalPropValue);
						break;
					default: if (isEventHandler(propName, externalPropValue)) mergedProps[propName] = mergeEventHandlers(mergedProps[propName], externalPropValue);
					else mergedProps[propName] = externalPropValue;
				}
			}
			return mergedProps;
		}
		function isEventHandler(key, value) {
			const code0 = key.charCodeAt(0);
			const code1 = key.charCodeAt(1);
			const code2 = key.charCodeAt(2);
			return code0 === 111 && code1 === 110 && code2 >= 65 && code2 <= 90 && (typeof value === "function" || typeof value === "undefined");
		}
		function isPropsGetter(inputProps) {
			return typeof inputProps === "function";
		}
		function mergeEventHandlers(ourHandler, theirHandler) {
			if (!theirHandler) return ourHandler;
			if (!ourHandler) return wrapEventHandler(theirHandler);
			return (...args) => {
				const event = args[0];
				if (isSyntheticEvent(event)) {
					const baseUIEvent = event;
					makeEventPreventable(baseUIEvent);
					const result = theirHandler(...args);
					if (!baseUIEvent.baseUIHandlerPrevented) ourHandler?.(...args);
					return result;
				}
				const result = theirHandler(...args);
				ourHandler?.(...args);
				return result;
			};
		}
		function wrapEventHandler(handler) {
			if (!handler) return handler;
			return (...args) => {
				const event = args[0];
				if (isSyntheticEvent(event)) makeEventPreventable(event);
				return handler(...args);
			};
		}
		function makeEventPreventable(event) {
			event.preventBaseUIHandler = () => {
				event.baseUIHandlerPrevented = true;
			};
			return event;
		}
		function mergeClassNames(ourClassName, theirClassName) {
			if (theirClassName) {
				if (ourClassName) return theirClassName + " " + ourClassName;
				return theirClassName;
			}
			return ourClassName;
		}
		function isSyntheticEvent(event) {
			return event != null && typeof event === "object" && "nativeEvent" in event;
		}
		//#endregion
		//#region node_modules/.pnpm/@base-ui+react@1.9.0_@date-fns+tz@1.5.0_@types+react@18.3.31_date-fns@4.4.0_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/react/internals/useRenderElement.mjs
		/**
		* Renders a Base UI element.
		*
		* @param element The default HTML element to render. Can be overridden by the `render` prop.
		* @param componentProps An object containing the `render` and `className` props to be used for element customization. Other props are ignored.
		* @param params Additional parameters for rendering the element.
		*/
		function useRenderElement(element, componentProps, params = {}) {
			let renderProp = componentProps.render;
			if (params.enabled !== false) renderProp = unwrapLazyRenderProp(renderProp);
			const outProps = useRenderElementProps(componentProps, params, renderProp);
			if (params.enabled === false) return null;
			const state = params.state ?? EMPTY_OBJECT;
			return evaluateRenderProp(element, renderProp, outProps, state);
		}
		/**
		* Computes render element final props.
		*/
		function useRenderElementProps(componentProps, params, renderProp) {
			const { className: classNameProp, style: styleProp } = componentProps;
			const { state = EMPTY_OBJECT, ref, props, stateAttributesMapping, enabled = true } = params;
			const className = enabled ? resolveClassName(classNameProp, state) : void 0;
			const style = enabled ? resolveStyle(styleProp, state) : void 0;
			const stateProps = enabled ? getStateAttributesProps(state, stateAttributesMapping) : EMPTY_OBJECT;
			const resolvedProps = enabled && props ? resolveRenderFunctionProps(props) : void 0;
			const outProps = enabled ? mergeObjects(stateProps, resolvedProps) ?? {} : EMPTY_OBJECT;
			if (typeof document !== "undefined") {
				if (!enabled) useMergedRefs(null, null);
				else if (Array.isArray(ref)) outProps.ref = useMergedRefsN([
					outProps.ref,
					getReactElementRef(renderProp),
					...ref
				]);
				else outProps.ref = useMergedRefs(outProps.ref, getReactElementRef(renderProp), ref);
			}
			if (!enabled) return EMPTY_OBJECT;
			if (className !== void 0) outProps.className = mergeClassNames(outProps.className, className);
			if (style !== void 0) outProps.style = mergeObjects(outProps.style, style);
			return outProps;
		}
		function resolveRenderFunctionProps(props) {
			if (Array.isArray(props)) return mergePropsN(props);
			return mergeProps(void 0, props);
		}
		const REACT_LAZY_TYPE = Symbol.for("react.lazy");
		function unwrapLazyRenderProp(render) {
			if (render?.$$typeof !== REACT_LAZY_TYPE) return render;
			const unwrapped = react.Children.toArray(render)[0];
			return /*#__PURE__*/ react.isValidElement(unwrapped) ? unwrapped : render;
		}
		function evaluateRenderProp(element, render, props, state) {
			if (render) {
				if (typeof render === "function") return render(props, state);
				const mergedProps = mergeProps(props, render.props);
				mergedProps.ref = props.ref;
				return /*#__PURE__*/ react.cloneElement(render, mergedProps);
			}
			return renderTag(element, props);
		}
		function renderTag(Tag, props) {
			if (Tag === "button") return /*#__PURE__*/ (0, react.createElement)("button", {
				type: "button",
				...props,
				key: props.key
			});
			if (Tag === "img") return /*#__PURE__*/ (0, react.createElement)("img", {
				alt: "",
				...props,
				key: props.key
			});
			return /*#__PURE__*/ react.createElement(Tag, props);
		}
		//#endregion
		//#region node_modules/.pnpm/@base-ui+react@1.9.0_@date-fns+tz@1.5.0_@types+react@18.3.31_date-fns@4.4.0_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/react/internals/constants.mjs
		const DISABLED_TRANSITIONS_STYLE = { style: { transition: "none" } };
		/**
		* Used for dropdowns that usually strictly prefer top/bottom placements and
		* use `var(--available-height)` to limit their height.
		*/
		const DROPDOWN_COLLISION_AVOIDANCE = { fallbackAxisSide: "none" };
		/**
		* Used by regular popups that usually aren't scrollable and are allowed to
		* freely flip to any axis of placement.
		*/
		const POPUP_COLLISION_AVOIDANCE = { fallbackAxisSide: "end" };
		/**
		* Special visually hidden styles for the aria-owns owner element to ensure owned element
		* accessibility in iOS/Safari/VoiceControl.
		* The owner element is an empty span, so most of the common visually hidden styles are not needed.
		* @see https://github.com/floating-ui/floating-ui/issues/3403
		*/
		const ownerVisuallyHidden = {
			clipPath: "inset(50%)",
			position: "fixed",
			top: 0,
			left: 0
		};
		//#endregion
		//#region node_modules/.pnpm/@base-ui+react@1.9.0_@date-fns+tz@1.5.0_@types+react@18.3.31_date-fns@4.4.0_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/react/floating-ui-react/components/FloatingPortal.mjs
		const PortalContext = /*#__PURE__*/ react.createContext(null);
		const usePortalContext = () => react.useContext(PortalContext);
		const attr = createAttribute("portal");
		function useFloatingPortalNode(props = {}) {
			const { ref, container: containerProp, componentProps = EMPTY_OBJECT, elementProps } = props;
			const uniqueId = useId$6();
			const parentPortalNode = usePortalContext()?.portalNode;
			const [containerElement, setContainerElement] = react.useState(null);
			const [portalNode, setPortalNode] = react.useState(null);
			const setPortalNodeRef = useStableCallback((node) => {
				if (node !== null) setPortalNode(node);
			});
			const containerRef = react.useRef(null);
			useIsoLayoutEffect(() => {
				if (containerProp === null) {
					if (containerRef.current) {
						containerRef.current = null;
						setPortalNode(null);
						setContainerElement(null);
					}
					return;
				}
				const resolvedContainer = (containerProp && (isNode(containerProp) ? containerProp : containerProp.current)) ?? parentPortalNode ?? document.body;
				if (resolvedContainer == null) {
					if (containerRef.current) {
						containerRef.current = null;
						setPortalNode(null);
						setContainerElement(null);
					}
					return;
				}
				if (containerRef.current !== resolvedContainer) {
					containerRef.current = resolvedContainer;
					setPortalNode(null);
					setContainerElement(resolvedContainer);
				}
			}, [containerProp, parentPortalNode]);
			const portalElement = useRenderElement("div", componentProps, {
				ref: [ref, setPortalNodeRef],
				props: [{
					id: uniqueId,
					[attr]: ""
				}, elementProps]
			});
			const portalSubtree = containerElement && portalElement ? /*#__PURE__*/ react_dom.createPortal(portalElement, containerElement) : null;
			return {
				node: portalNode,
				nodeId: /*#__PURE__*/ react.isValidElement(portalElement) ? portalElement.props.id : void 0,
				subtree: portalSubtree
			};
		}
		/**
		* Portals the floating element into a given container element — by default,
		* outside of the app root and into the body.
		* This is necessary to ensure the floating element can appear outside any
		* potential parent containers that cause clipping (such as `overflow: hidden`),
		* while retaining its location in the React tree.
		* @see https://floating-ui.com/docs/FloatingPortal
		* @internal
		*/
		const FloatingPortal = /*#__PURE__*/ react.forwardRef(function FloatingPortal(componentProps, forwardedRef) {
			const { render, className, style, children, container, portalOwnerRole, ...elementProps } = componentProps;
			const { node: portalNode, nodeId: portalNodeId, subtree: portalSubtree } = useFloatingPortalNode({
				container,
				ref: forwardedRef,
				componentProps,
				elementProps
			});
			const beforeOutsideRef = react.useRef(null);
			const afterOutsideRef = react.useRef(null);
			const beforeInsideRef = react.useRef(null);
			const afterInsideRef = react.useRef(null);
			const [focusManagerState, setFocusManagerState] = react.useState(null);
			const focusInsideDisabledRef = react.useRef(false);
			const modal = focusManagerState?.modal;
			const open = focusManagerState?.open;
			const shouldRenderGuards = !!focusManagerState && !focusManagerState.modal && focusManagerState.open && !!portalNode;
			react.useEffect(() => {
				if (!portalNode || modal) return;
				function onFocus(event) {
					if (portalNode && event.relatedTarget && isOutsideEvent(event)) {
						if (event.type === "focusin") {
							if (focusInsideDisabledRef.current) {
								enableFocusInside(portalNode);
								focusInsideDisabledRef.current = false;
							}
						} else {
							disableFocusInside(portalNode);
							focusInsideDisabledRef.current = true;
						}
					}
				}
				return mergeCleanups(addEventListener(portalNode, "focusin", onFocus, true), addEventListener(portalNode, "focusout", onFocus, true));
			}, [portalNode, modal]);
			useIsoLayoutEffect(() => {
				if (!portalNode || open !== true || !focusInsideDisabledRef.current) return;
				enableFocusInside(portalNode);
				focusInsideDisabledRef.current = false;
			}, [open, portalNode]);
			const portalContextValue = react.useMemo(() => ({
				beforeOutsideRef,
				afterOutsideRef,
				beforeInsideRef,
				afterInsideRef,
				portalNode,
				setFocusManagerState
			}), [portalNode]);
			return /*#__PURE__*/ (0, react_jsx_runtime.jsxs)(react.Fragment, { children: [portalSubtree, /*#__PURE__*/ (0, react_jsx_runtime.jsxs)(PortalContext.Provider, {
				value: portalContextValue,
				children: [
					shouldRenderGuards && portalNode && /*#__PURE__*/ (0, react_jsx_runtime.jsx)(FocusGuard, {
						"data-type": "outside",
						ref: beforeOutsideRef,
						onFocus: (event) => {
							if (isOutsideEvent(event, portalNode)) beforeInsideRef.current?.focus();
							else getPreviousTabbable(focusManagerState ? focusManagerState.domReference : null)?.focus();
						}
					}),
					shouldRenderGuards && portalNode && /*#__PURE__*/ (0, react_jsx_runtime.jsx)("span", {
						role: portalOwnerRole,
						"aria-owns": portalNodeId,
						style: ownerVisuallyHidden
					}),
					portalNode && /*#__PURE__*/ react_dom.createPortal(children, portalNode),
					shouldRenderGuards && portalNode && /*#__PURE__*/ (0, react_jsx_runtime.jsx)(FocusGuard, {
						"data-type": "outside",
						ref: afterOutsideRef,
						onFocus: (event) => {
							if (isOutsideEvent(event, portalNode)) afterInsideRef.current?.focus();
							else {
								getNextTabbable(focusManagerState ? focusManagerState.domReference : null)?.focus();
								if (focusManagerState?.closeOnFocusOut) focusManagerState?.onOpenChange(false, createChangeEventDetails("focus-out", event.nativeEvent));
							}
						}
					})
				]
			})] });
		});
		//#endregion
		//#region node_modules/.pnpm/@base-ui+react@1.9.0_@date-fns+tz@1.5.0_@types+react@18.3.31_date-fns@4.4.0_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/react/floating-ui-react/utils/createEventEmitter.mjs
		function createEventEmitter() {
			const map = /* @__PURE__ */ new Map();
			return {
				emit(event, data) {
					map.get(event)?.forEach((listener) => listener(data));
				},
				on(event, listener) {
					if (!map.has(event)) map.set(event, /* @__PURE__ */ new Set());
					map.get(event).add(listener);
				},
				off(event, listener) {
					map.get(event)?.delete(listener);
				}
			};
		}
		//#endregion
		//#region node_modules/.pnpm/@base-ui+react@1.9.0_@date-fns+tz@1.5.0_@types+react@18.3.31_date-fns@4.4.0_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/react/floating-ui-react/components/FloatingTreeStore.mjs
		/**
		* Stores and manages floating elements in a tree structure.
		* This is a backing store for the `FloatingTree` component.
		*/
		var FloatingTreeStore = class {
			nodesRef = { current: [] };
			events = createEventEmitter();
			addNode(node) {
				this.nodesRef.current.push(node);
			}
			removeNode(node) {
				const index = this.nodesRef.current.findIndex((n) => n === node);
				if (index !== -1) this.nodesRef.current.splice(index, 1);
			}
		};
		//#endregion
		//#region node_modules/.pnpm/@base-ui+react@1.9.0_@date-fns+tz@1.5.0_@types+react@18.3.31_date-fns@4.4.0_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/react/floating-ui-react/components/FloatingTree.mjs
		const FloatingNodeContext = /*#__PURE__*/ react.createContext(null);
		const FloatingTreeContext = /*#__PURE__*/ react.createContext(null);
		const useFloatingParentNodeId = () => react.useContext(FloatingNodeContext)?.id || null;
		/**
		* Returns the nearest floating tree context, if available.
		*/
		const useFloatingTree = (externalTree) => {
			const contextTree = react.useContext(FloatingTreeContext);
			return externalTree ?? contextTree;
		};
		/**
		* Registers a node into the `FloatingTree`, returning its id.
		* @see https://floating-ui.com/docs/FloatingTree
		*/
		function useFloatingNodeId(externalTree) {
			const id = useId$6();
			const tree = useFloatingTree(externalTree);
			const parentId = useFloatingParentNodeId();
			useIsoLayoutEffect(() => {
				if (!id) return;
				const node = {
					id,
					parentId
				};
				tree?.addNode(node);
				return () => {
					tree?.removeNode(node);
				};
			}, [
				tree,
				id,
				parentId
			]);
			return id;
		}
		/**
		* Provides parent node context for nested floating elements.
		* @see https://floating-ui.com/docs/FloatingTree
		* @internal
		*/
		function FloatingNode(props) {
			const { children, id } = props;
			const parentId = useFloatingParentNodeId();
			return /*#__PURE__*/ (0, react_jsx_runtime.jsx)(FloatingNodeContext.Provider, {
				value: react.useMemo(() => ({
					id,
					parentId
				}), [id, parentId]),
				children
			});
		}
		/**
		* Provides context for nested floating elements when they are not children of
		* each other on the DOM.
		* This is not necessary in all cases, except when there must be explicit communication between parent and child floating elements. It is necessary for:
		* - The `bubbles` option in the `useDismiss()` Hook
		* - Nested virtual list navigation
		* - Nested floating elements that each open on hover
		* - Custom communication between parent and child floating elements
		* @see https://floating-ui.com/docs/FloatingTree
		* @internal
		*/
		function FloatingTree(props) {
			const { children, externalTree } = props;
			const tree = useRefWithInit(() => externalTree ?? new FloatingTreeStore()).current;
			return /*#__PURE__*/ (0, react_jsx_runtime.jsx)(FloatingTreeContext.Provider, {
				value: tree,
				children
			});
		}
		//#endregion
		//#region node_modules/.pnpm/@base-ui+react@1.9.0_@date-fns+tz@1.5.0_@types+react@18.3.31_date-fns@4.4.0_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/react/utils/resolveRef.mjs
		/**
		* If the provided argument is a ref object, returns its `current` value.
		* Otherwise, returns the argument itself.
		*/
		function resolveRef(maybeRef) {
			if (maybeRef == null) return maybeRef;
			return "current" in maybeRef ? maybeRef.current : maybeRef;
		}
		//#endregion
		//#region node_modules/.pnpm/@base-ui+react@1.9.0_@date-fns+tz@1.5.0_@types+react@18.3.31_date-fns@4.4.0_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/react/floating-ui-react/components/FloatingFocusManager.mjs
		function getEventType(event, lastInteractionType) {
			const win = getWindow(getTarget(event));
			if (event instanceof win.KeyboardEvent) return "keyboard";
			if (event instanceof win.FocusEvent) return lastInteractionType || "keyboard";
			if ("pointerType" in event) return event.pointerType || (isVirtualClick(event) ? "keyboard" : lastInteractionType || "mouse");
			if ("touches" in event) return "touch";
			if (event instanceof win.MouseEvent) return lastInteractionType || (event.detail === 0 ? "keyboard" : "mouse");
			return "";
		}
		const LIST_LIMIT = 20;
		let previouslyFocusedElements = [];
		function clearDisconnectedPreviouslyFocusedElements() {
			previouslyFocusedElements = previouslyFocusedElements.filter((entry) => {
				return entry.deref()?.isConnected;
			});
		}
		function addPreviouslyFocusedElement(element) {
			clearDisconnectedPreviouslyFocusedElements();
			if (element && getNodeName(element) !== "body") {
				previouslyFocusedElements.push(new WeakRef(element));
				if (previouslyFocusedElements.length > LIST_LIMIT) previouslyFocusedElements = previouslyFocusedElements.slice(-20);
			}
		}
		function getPreviouslyFocusedElement() {
			clearDisconnectedPreviouslyFocusedElements();
			return previouslyFocusedElements[previouslyFocusedElements.length - 1]?.deref();
		}
		function getFirstTabbableElement(container) {
			if (!container) return null;
			if (isTabbable(container)) return container;
			return tabbable(container)[0] || container;
		}
		function handleTabIndex(floatingFocusElement) {
			if (floatingFocusElement.hasAttribute("tabindex") && !floatingFocusElement.hasAttribute("data-tabindex")) return;
			if (!floatingFocusElement.getAttribute("role")?.includes("dialog")) return;
			const tabbableContent = focusable(floatingFocusElement).filter((element) => {
				const dataTabIndex = element.getAttribute("data-tabindex") || "";
				return isTabbable(element) || element.hasAttribute("data-tabindex") && !dataTabIndex.startsWith("-");
			});
			const tabIndex = floatingFocusElement.getAttribute("tabindex");
			if (tabbableContent.length === 0) {
				if (tabIndex !== "0") {
					floatingFocusElement.setAttribute("tabindex", "0");
					floatingFocusElement.setAttribute("data-tabindex", "0");
				}
			} else if (tabIndex !== "-1" || floatingFocusElement.hasAttribute("data-tabindex") && floatingFocusElement.getAttribute("data-tabindex") !== "-1") {
				floatingFocusElement.setAttribute("tabindex", "-1");
				floatingFocusElement.setAttribute("data-tabindex", "-1");
			}
		}
		/**
		* Provides focus management for the floating element.
		* @see https://floating-ui.com/docs/FloatingFocusManager
		* @internal
		*/
		function FloatingFocusManager(props) {
			const { context: store, children, disabled = false, initialFocus = true, returnFocus = true, explicitReturnFocus, restoreFocus = false, modal = true, closeOnFocusOut = true, openInteractionType = "", nextFocusableElement, previousFocusableElement, beforeContentFocusGuardRef, externalTree, getInsideElements } = props;
			const open = store.useState("open");
			const domReference = store.useState("domReferenceElement");
			const floating = store.useState("floatingElement");
			const { events, dataRef } = store.context;
			const getNodeId = useStableCallback(() => dataRef.current.floatingContext?.nodeId);
			const ignoreInitialFocus = initialFocus === false;
			const isUntrappedTypeableCombobox = isTypeableCombobox(domReference) && ignoreInitialFocus;
			const initialFocusRef = useValueAsRef(initialFocus);
			const returnFocusRef = useValueAsRef(returnFocus);
			const explicitReturnFocusRef = useValueAsRef(explicitReturnFocus);
			const openInteractionTypeRef = useValueAsRef(openInteractionType);
			const openRef = useValueAsRef(open);
			const tree = useFloatingTree(externalTree);
			const portalContext = usePortalContext();
			const preventReturnFocusRef = react.useRef(false);
			const isPointerDownRef = react.useRef(false);
			const pointerDownOutsideRef = react.useRef(false);
			const lastFocusedTabbableRef = react.useRef(null);
			const closeTypeRef = react.useRef("");
			const lastInteractionTypeRef = react.useRef("");
			const beforeGuardRef = react.useRef(null);
			const afterGuardRef = react.useRef(null);
			const mergedBeforeGuardRef = useMergedRefs(beforeGuardRef, beforeContentFocusGuardRef, portalContext?.beforeInsideRef);
			const mergedAfterGuardRef = useMergedRefs(afterGuardRef, portalContext?.afterInsideRef);
			const blurTimeout = useTimeout();
			const pointerDownTimeout = useTimeout();
			const restoreFocusFrame = useAnimationFrame();
			const isInsidePortal = portalContext != null;
			const floatingFocusElement = getFloatingFocusElement(floating);
			const getTabbableContent = useStableCallback((container = floatingFocusElement) => {
				return container ? tabbable(container) : [];
			});
			const getResolvedInsideElements = useStableCallback(() => getInsideElements?.().filter((element) => element != null) ?? []);
			react.useEffect(() => {
				if (disabled || !modal) return;
				function onKeyDown(event) {
					if (event.key === "Tab") {
						if (contains(floatingFocusElement, activeElement(ownerDocument(floatingFocusElement))) && getTabbableContent().length === 0 && !isUntrappedTypeableCombobox) stopEvent(event);
					}
				}
				return addEventListener(ownerDocument(floatingFocusElement), "keydown", onKeyDown);
			}, [
				disabled,
				floatingFocusElement,
				modal,
				isUntrappedTypeableCombobox,
				getTabbableContent
			]);
			react.useEffect(() => {
				if (disabled || !open) return;
				const doc = ownerDocument(floatingFocusElement);
				function clearPointerDownOutside() {
					pointerDownOutsideRef.current = false;
				}
				function onPointerDown(event) {
					const target = getTarget(event);
					const insideElements = getResolvedInsideElements();
					const pointerTargetInside = contains(floating, target) || contains(domReference, target) || contains(portalContext?.portalNode, target) || insideElements.some((element) => element === target || contains(element, target));
					pointerDownOutsideRef.current = !pointerTargetInside;
					lastInteractionTypeRef.current = event.pointerType || "keyboard";
					if (closest(target, `[data-base-ui-click-trigger]`)) {
						isPointerDownRef.current = true;
						pointerDownTimeout.start(0, () => {
							isPointerDownRef.current = false;
						});
					}
				}
				function onKeyDown() {
					lastInteractionTypeRef.current = "keyboard";
				}
				return mergeCleanups(addEventListener(doc, "pointerdown", onPointerDown, true), addEventListener(doc, "pointerup", clearPointerDownOutside, true), addEventListener(doc, "pointercancel", clearPointerDownOutside, true), addEventListener(doc, "keydown", onKeyDown, true), clearPointerDownOutside);
			}, [
				disabled,
				floating,
				domReference,
				floatingFocusElement,
				open,
				portalContext,
				pointerDownTimeout,
				getResolvedInsideElements
			]);
			react.useEffect(() => {
				if (disabled || !closeOnFocusOut) return;
				const doc = ownerDocument(floatingFocusElement);
				function handlePointerDown() {
					isPointerDownRef.current = true;
					pointerDownTimeout.start(0, () => {
						isPointerDownRef.current = false;
					});
				}
				function handleFocusIn(event) {
					const target = getTarget(event);
					if (isTabbable(target)) lastFocusedTabbableRef.current = target;
				}
				function handleFocusOutside(event) {
					const relatedTarget = event.relatedTarget;
					const currentTarget = event.currentTarget;
					const target = getTarget(event);
					if (modal && relatedTarget == null && target != null && contains(floating, target)) addPreviouslyFocusedElement(target);
					queueMicrotask(() => {
						const nodeId = getNodeId();
						const triggers = store.context.triggerElements;
						const insideElements = getResolvedInsideElements();
						const isRelatedFocusGuard = relatedTarget?.hasAttribute(createAttribute("focus-guard")) && [
							beforeGuardRef.current,
							afterGuardRef.current,
							portalContext?.beforeInsideRef.current,
							portalContext?.afterInsideRef.current,
							portalContext?.beforeOutsideRef.current,
							portalContext?.afterOutsideRef.current,
							resolveRef(previousFocusableElement),
							resolveRef(nextFocusableElement)
						].includes(relatedTarget);
						const movedToUnrelatedNode = !(contains(domReference, relatedTarget) || contains(floating, relatedTarget) || contains(relatedTarget, floating) || contains(portalContext?.portalNode, relatedTarget) || insideElements.some((element) => element === relatedTarget || contains(element, relatedTarget)) || triggers.hasMatchingElement((trigger) => contains(trigger, relatedTarget)) || isRelatedFocusGuard || tree && (getNodeChildren(tree.nodesRef.current, nodeId).find((node) => contains(node.context?.elements.floating, relatedTarget) || contains(node.context?.elements.domReference, relatedTarget)) || getNodeAncestors(tree.nodesRef.current, nodeId).find((node) => [node.context?.elements.floating, getFloatingFocusElement(node.context?.elements.floating)].includes(relatedTarget) || node.context?.elements.domReference === relatedTarget)));
						if (currentTarget === domReference && floatingFocusElement) handleTabIndex(floatingFocusElement);
						if (restoreFocus && currentTarget !== domReference && !isElementVisible(target) && activeElement(doc) === doc.body) {
							if (isHTMLElement(floatingFocusElement)) {
								floatingFocusElement.focus();
								if (restoreFocus === "popup") {
									restoreFocusFrame.request(() => {
										floatingFocusElement.focus();
									});
									return;
								}
							}
							const tabbableContent = getTabbableContent();
							const prevTabbable = lastFocusedTabbableRef.current;
							const nodeToFocus = (prevTabbable && tabbableContent.includes(prevTabbable) ? prevTabbable : null) || tabbableContent[tabbableContent.length - 1] || floatingFocusElement;
							if (isHTMLElement(nodeToFocus)) nodeToFocus.focus();
						}
						if (dataRef.current.insideReactTree) {
							dataRef.current.insideReactTree = false;
							return;
						}
						if ((isUntrappedTypeableCombobox ? true : !modal) && relatedTarget && movedToUnrelatedNode && !isPointerDownRef.current && (isUntrappedTypeableCombobox || relatedTarget !== getPreviouslyFocusedElement())) {
							preventReturnFocusRef.current = true;
							store.setOpen(false, createChangeEventDetails(focusOut, event));
						}
					});
				}
				function markInsideReactTree() {
					if (pointerDownOutsideRef.current) return;
					dataRef.current.insideReactTree = true;
					blurTimeout.start(0, () => {
						dataRef.current.insideReactTree = false;
					});
				}
				const domReferenceElement = isHTMLElement(domReference) ? domReference : null;
				if (!floating && !domReferenceElement) return;
				return mergeCleanups(domReferenceElement && addEventListener(domReferenceElement, "focusout", handleFocusOutside), domReferenceElement && addEventListener(domReferenceElement, "pointerdown", handlePointerDown), floating && addEventListener(floating, "focusin", handleFocusIn), floating && addEventListener(floating, "focusout", handleFocusOutside), floating && portalContext && addEventListener(floating, "focusout", markInsideReactTree, true));
			}, [
				disabled,
				domReference,
				floating,
				floatingFocusElement,
				modal,
				tree,
				portalContext,
				store,
				closeOnFocusOut,
				restoreFocus,
				getTabbableContent,
				isUntrappedTypeableCombobox,
				getNodeId,
				dataRef,
				blurTimeout,
				pointerDownTimeout,
				restoreFocusFrame,
				nextFocusableElement,
				previousFocusableElement,
				getResolvedInsideElements
			]);
			react.useEffect(() => {
				if (disabled || !floating || !open) return;
				const portalNodes = Array.from(portalContext?.portalNode?.querySelectorAll(`[${createAttribute("portal")}]`) || []);
				const rootAncestorComboboxDomReference = (tree ? getNodeAncestors(tree.nodesRef.current, getNodeId()) : []).find((node) => isTypeableCombobox(node.context?.elements.domReference || null))?.context?.elements.domReference;
				const ariaHiddenCleanup = markOthers([
					...[
						floating,
						...portalNodes,
						beforeGuardRef.current,
						afterGuardRef.current,
						portalContext?.beforeOutsideRef.current,
						portalContext?.afterOutsideRef.current,
						...getResolvedInsideElements()
					],
					rootAncestorComboboxDomReference,
					resolveRef(previousFocusableElement),
					resolveRef(nextFocusableElement),
					isUntrappedTypeableCombobox ? domReference : null
				].filter((x) => x != null), {
					ariaHidden: modal || isUntrappedTypeableCombobox,
					mark: false
				});
				const markerCleanup = markOthers([floating, ...portalNodes].filter((x) => x != null));
				return () => {
					markerCleanup();
					ariaHiddenCleanup();
				};
			}, [
				open,
				disabled,
				domReference,
				floating,
				modal,
				portalContext,
				isUntrappedTypeableCombobox,
				tree,
				getNodeId,
				nextFocusableElement,
				previousFocusableElement,
				getResolvedInsideElements
			]);
			useIsoLayoutEffect(() => {
				if (!open || disabled || !isHTMLElement(floatingFocusElement)) return;
				closeTypeRef.current = "";
				lastInteractionTypeRef.current = "";
				const doc = ownerDocument(floatingFocusElement);
				const previouslyFocusedElement = activeElement(doc);
				queueMicrotask(() => {
					const initialFocusValueOrFn = initialFocusRef.current;
					const resolvedInitialFocus = typeof initialFocusValueOrFn === "function" ? initialFocusValueOrFn(openInteractionTypeRef.current || "") : initialFocusValueOrFn;
					if (resolvedInitialFocus === void 0 || resolvedInitialFocus === false) return;
					if (contains(floatingFocusElement, previouslyFocusedElement)) return;
					let focusableElements = null;
					const getDefaultFocusElement = () => {
						if (focusableElements == null) focusableElements = getTabbableContent(floatingFocusElement);
						return focusableElements[0] || floatingFocusElement;
					};
					let elToFocus;
					if (resolvedInitialFocus === true || resolvedInitialFocus === null) elToFocus = getDefaultFocusElement();
					else elToFocus = resolveRef(resolvedInitialFocus);
					elToFocus = elToFocus || getDefaultFocusElement();
					const hadFocusInside = contains(floatingFocusElement, activeElement(doc));
					const openEvent = dataRef.current.openEvent;
					const openedByVirtualPress = openEvent?.type === "mousedown" && isVirtualClick(openEvent);
					enqueueFocus(elToFocus, {
						sync: openedByVirtualPress,
						preventScroll: elToFocus === floatingFocusElement,
						shouldFocus() {
							if (!openRef.current) return false;
							if (hadFocusInside) return true;
							const currentActiveElement = activeElement(doc);
							return !(currentActiveElement !== elToFocus && contains(floatingFocusElement, currentActiveElement));
						}
					});
				});
			}, [
				disabled,
				open,
				floatingFocusElement,
				getTabbableContent,
				initialFocusRef,
				openInteractionTypeRef,
				openRef,
				dataRef
			]);
			const pendingReturnFocusRef = react.useRef(null);
			useIsoLayoutEffect(() => {
				if (disabled || !floatingFocusElement) {
					pendingReturnFocusRef.current = null;
					return;
				}
				if (pendingReturnFocusRef.current) {
					pendingReturnFocusRef.current.cancelled = true;
					pendingReturnFocusRef.current = null;
				}
				const doc = ownerDocument(floatingFocusElement);
				const elementFocusedBeforeOpen = activeElement(doc);
				const preferPreviousFocus = openInteractionTypeRef.current == null;
				addPreviouslyFocusedElement(elementFocusedBeforeOpen);
				function onOpenChangeLocal(details) {
					if (!details.open) closeTypeRef.current = getEventType(details.nativeEvent, lastInteractionTypeRef.current);
					if (details.reason === "focus-out" && details.triggerElement?.hasAttribute(createAttribute("focus-guard")) || details.reason === "trigger-hover" && details.nativeEvent.type === "mouseleave") preventReturnFocusRef.current = true;
					if (details.reason !== "outside-press") return;
					if (details.nested) preventReturnFocusRef.current = false;
					else if (isVirtualClick(details.nativeEvent) || isVirtualPointerEvent(details.nativeEvent)) preventReturnFocusRef.current = false;
					else {
						let isPreventScrollSupported = false;
						ownerDocument(floatingFocusElement).createElement("div").focus({ get preventScroll() {
							isPreventScrollSupported = true;
							return false;
						} });
						if (isPreventScrollSupported) preventReturnFocusRef.current = false;
						else preventReturnFocusRef.current = true;
					}
				}
				events.on("openchange", onOpenChangeLocal);
				function getReturnElement(closeType) {
					const returnFocusValueOrFn = returnFocusRef.current;
					let resolvedReturnFocusValue = typeof returnFocusValueOrFn === "function" ? returnFocusValueOrFn(closeType) : returnFocusValueOrFn;
					if (resolvedReturnFocusValue === void 0 || resolvedReturnFocusValue === false) return null;
					if (resolvedReturnFocusValue === null) resolvedReturnFocusValue = true;
					const referenceReturnElement = domReference?.isConnected ? domReference : null;
					const previousReturnElement = elementFocusedBeforeOpen?.isConnected && getNodeName(elementFocusedBeforeOpen) !== "body" ? elementFocusedBeforeOpen : null;
					let defaultReturnElement = preferPreviousFocus ? previousReturnElement || referenceReturnElement : referenceReturnElement || previousReturnElement;
					if (!defaultReturnElement) defaultReturnElement = getPreviouslyFocusedElement() || null;
					if (typeof resolvedReturnFocusValue === "boolean") return defaultReturnElement;
					return resolveRef(resolvedReturnFocusValue) || defaultReturnElement || null;
				}
				return () => {
					events.off("openchange", onOpenChangeLocal);
					const activeEl = activeElement(doc);
					const insideElements = getResolvedInsideElements();
					const isFocusInsideFloatingTree = contains(floating, activeEl) || insideElements.some((element) => element === activeEl || contains(element, activeEl)) || tree && getNodeChildren(tree.nodesRef.current, getNodeId(), false).some((node) => contains(node.context?.elements.floating, activeEl));
					const returnFocusValueOrFn = returnFocusRef.current;
					const closeType = closeTypeRef.current;
					const returnElement = getReturnElement(closeType);
					const job = { cancelled: false };
					pendingReturnFocusRef.current = job;
					queueMicrotask(() => {
						if (pendingReturnFocusRef.current === job) pendingReturnFocusRef.current = null;
						const tabbableReturnElement = getFirstTabbableElement(returnElement);
						const hasExplicitReturnFocus = explicitReturnFocusRef.current ?? typeof returnFocusValueOrFn !== "boolean";
						if (!job.cancelled && returnFocusValueOrFn && !preventReturnFocusRef.current && isHTMLElement(tabbableReturnElement) && (!hasExplicitReturnFocus && tabbableReturnElement !== activeEl && activeEl !== doc.body ? isFocusInsideFloatingTree : true)) {
							const focusOptions = { preventScroll: true };
							if (closeType === "keyboard") focusOptions.focusVisible = true;
							tabbableReturnElement.focus(focusOptions);
						}
						preventReturnFocusRef.current = false;
					});
				};
			}, [
				disabled,
				floating,
				floatingFocusElement,
				returnFocusRef,
				explicitReturnFocusRef,
				openInteractionTypeRef,
				events,
				tree,
				domReference,
				getNodeId,
				getResolvedInsideElements
			]);
			useIsoLayoutEffect(() => {
				if (!webkit || open || !floating) return;
				const activeEl = activeElement(ownerDocument(floating));
				if (!isHTMLElement(activeEl) || !isTypeableElement(activeEl)) return;
				if (contains(floating, activeEl)) activeEl.blur();
			}, [open, floating]);
			useIsoLayoutEffect(() => {
				if (disabled || !portalContext) return;
				portalContext.setFocusManagerState({
					modal,
					closeOnFocusOut,
					open,
					onOpenChange: store.setOpen,
					domReference
				});
				return () => {
					portalContext.setFocusManagerState(null);
				};
			}, [
				disabled,
				portalContext,
				modal,
				open,
				store,
				closeOnFocusOut,
				domReference
			]);
			useIsoLayoutEffect(() => {
				if (disabled || !floatingFocusElement) return;
				handleTabIndex(floatingFocusElement);
				return () => {
					queueMicrotask(clearDisconnectedPreviouslyFocusedElements);
				};
			}, [disabled, floatingFocusElement]);
			const shouldRenderGuards = !disabled && (modal ? !isUntrappedTypeableCombobox : true) && (isInsidePortal || modal);
			return /*#__PURE__*/ (0, react_jsx_runtime.jsxs)(react.Fragment, { children: [
				shouldRenderGuards && /*#__PURE__*/ (0, react_jsx_runtime.jsx)(FocusGuard, {
					"data-type": "inside",
					ref: mergedBeforeGuardRef,
					onFocus: (event) => {
						if (modal) {
							const els = getTabbableContent();
							enqueueFocus(els[els.length - 1]);
						} else if (portalContext?.portalNode) {
							preventReturnFocusRef.current = false;
							if (isOutsideEvent(event, portalContext.portalNode)) getNextTabbable(domReference)?.focus();
							else resolveRef(previousFocusableElement ?? portalContext.beforeOutsideRef)?.focus();
						}
					}
				}),
				children,
				shouldRenderGuards && /*#__PURE__*/ (0, react_jsx_runtime.jsx)(FocusGuard, {
					"data-type": "inside",
					ref: mergedAfterGuardRef,
					onFocus: (event) => {
						if (modal) enqueueFocus(getTabbableContent()[0]);
						else if (portalContext?.portalNode) {
							if (closeOnFocusOut) preventReturnFocusRef.current = true;
							if (isOutsideEvent(event, portalContext.portalNode)) getPreviousTabbable(domReference)?.focus();
							else resolveRef(nextFocusableElement ?? portalContext.afterOutsideRef)?.focus();
						}
					}
				})
			] });
		}
		//#endregion
		//#region node_modules/.pnpm/@base-ui+react@1.9.0_@date-fns+tz@1.5.0_@types+react@18.3.31_date-fns@4.4.0_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/react/floating-ui-react/hooks/useClick.mjs
		/**
		* Opens or closes the floating element when clicking the reference element.
		* @see https://floating-ui.com/docs/useClick
		*/
		function useClick(store, props = {}) {
			const { enabled = true, event: eventOption = "click", toggle = true, ignoreMouse = false, stickIfOpen = true, touchOpenDelay = 0, reason = triggerPress } = props;
			const dataRef = store.context.dataRef;
			const pointerTypeRef = react.useRef(void 0);
			const frame = useAnimationFrame();
			const touchOpenTimeout = useTimeout();
			const reference = react.useMemo(() => {
				function setOpenWithTouchDelay(nextOpen, nativeEvent, target, pointerType) {
					const details = createChangeEventDetails(reason, nativeEvent, target);
					if (nextOpen && pointerType === "touch" && touchOpenDelay > 0) touchOpenTimeout.start(touchOpenDelay, () => {
						store.setOpen(true, details);
					});
					else store.setOpen(nextOpen, details);
				}
				function getNextOpen(open, currentTarget, isClickLikeOpenEvent) {
					const openEvent = dataRef.current.openEvent;
					const hasClickedOnInactiveTrigger = store.select("domReferenceElement") !== currentTarget;
					if (open && hasClickedOnInactiveTrigger) return true;
					if (!open) return true;
					if (!toggle) return true;
					if (openEvent && (typeof stickIfOpen === "function" ? stickIfOpen() : stickIfOpen)) return !isClickLikeOpenEvent(openEvent.type);
					return false;
				}
				return {
					onPointerDown(event) {
						pointerTypeRef.current = isMouseLikePointerType(event.pointerType, true) && isVirtualPointerEvent(event.nativeEvent) ? "virtual" : event.pointerType;
					},
					onMouseDown(event) {
						const pointerType = pointerTypeRef.current;
						const nativeEvent = event.nativeEvent;
						const open = store.select("open");
						if (event.button !== 0 || eventOption === "click" || isMouseLikePointerType(pointerType, true) && ignoreMouse) return;
						const nextOpen = getNextOpen(open, event.currentTarget, (openEventType) => openEventType === "click" || openEventType === "mousedown");
						const target = getTarget(nativeEvent);
						const isTypeable = isTypeableElement(target);
						if (isTypeable || pointerType === "virtual") {
							setOpenWithTouchDelay(nextOpen, nativeEvent, isTypeable ? target : event.currentTarget, pointerType);
							return;
						}
						const eventCurrentTarget = event.currentTarget;
						frame.request(() => {
							setOpenWithTouchDelay(nextOpen, nativeEvent, eventCurrentTarget, pointerType);
						});
					},
					onClick(event) {
						if (eventOption === "mousedown-only") return;
						const pointerType = pointerTypeRef.current;
						if (eventOption === "mousedown" && pointerType) {
							pointerTypeRef.current = void 0;
							return;
						}
						if (isMouseLikePointerType(pointerType, true) && ignoreMouse) return;
						setOpenWithTouchDelay(getNextOpen(store.select("open"), event.currentTarget, (openEventType) => openEventType === "click" || openEventType === "mousedown" || openEventType === "keydown" || openEventType === "keyup"), event.nativeEvent, event.currentTarget, pointerType);
					},
					onKeyDown() {
						pointerTypeRef.current = void 0;
					}
				};
			}, [
				dataRef,
				eventOption,
				ignoreMouse,
				reason,
				store,
				stickIfOpen,
				toggle,
				frame,
				touchOpenTimeout,
				touchOpenDelay
			]);
			return react.useMemo(() => enabled ? { reference } : EMPTY_OBJECT, [enabled, reference]);
		}
		//#endregion
		//#region node_modules/.pnpm/@base-ui+react@1.9.0_@date-fns+tz@1.5.0_@types+react@18.3.31_date-fns@4.4.0_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/react/floating-ui-react/hooks/useClientPoint.mjs
		function createVirtualElement(domElement, data) {
			let offsetX = null;
			let offsetY = null;
			let isAutoUpdateEvent = false;
			return {
				contextElement: domElement || void 0,
				getBoundingClientRect() {
					const domRect = domElement?.getBoundingClientRect() || {
						width: 0,
						height: 0,
						x: 0,
						y: 0
					};
					const isXAxis = data.axis === "x" || data.axis === "both";
					const isYAxis = data.axis === "y" || data.axis === "both";
					const canTrackCursorOnAutoUpdate = ["mouseenter", "mousemove"].includes(data.dataRef.current.openEvent?.type || "") && data.pointerType !== "touch";
					const width = data.axis === "y" ? domRect.width : 0;
					const height = data.axis === "x" ? domRect.height : 0;
					let x = domRect.x;
					let y = domRect.y;
					if (offsetX == null && data.x && isXAxis) offsetX = domRect.x - data.x;
					if (offsetY == null && data.y && isYAxis) offsetY = domRect.y - data.y;
					x -= offsetX || 0;
					y -= offsetY || 0;
					if (!isAutoUpdateEvent || canTrackCursorOnAutoUpdate) {
						x = isXAxis && data.x != null ? data.x : x;
						y = isYAxis && data.y != null ? data.y : y;
					}
					isAutoUpdateEvent = true;
					return {
						width,
						height,
						x,
						y,
						top: y,
						right: x + width,
						bottom: y + height,
						left: x
					};
				}
			};
		}
		function isMouseBasedEvent(event) {
			return event != null && event.clientX != null;
		}
		/**
		* Positions the floating element relative to a client point (in the viewport),
		* such as the mouse position. By default, it follows the mouse cursor.
		* @see https://floating-ui.com/docs/useClientPoint
		*/
		function useClientPoint(store, props = {}) {
			const { enabled = true, axis = "both" } = props;
			const open = store.useState("open");
			const floating = store.useState("floatingElement");
			const domReference = store.useState("domReferenceElement");
			const dataRef = store.context.dataRef;
			const initialRef = react.useRef(false);
			const cleanupListenerRef = react.useRef(null);
			const [pointerType, setPointerType] = react.useState();
			const [reactive, setReactive] = react.useState([]);
			const resetReference = useStableCallback((reference) => {
				store.set("positionReference", reference);
			});
			const setReference = useStableCallback((newX, newY, referenceElement) => {
				if (initialRef.current) return;
				if (dataRef.current.openEvent && !isMouseBasedEvent(dataRef.current.openEvent)) return;
				store.set("positionReference", createVirtualElement(referenceElement ?? domReference, {
					x: newX,
					y: newY,
					axis,
					dataRef,
					pointerType
				}));
			});
			const handleReferenceEnterOrMove = useStableCallback((event) => {
				if (!open) setReference(event.clientX, event.clientY, event.currentTarget);
				else if (!cleanupListenerRef.current) {
					setReference(event.clientX, event.clientY, event.currentTarget);
					setReactive([]);
				}
			});
			const openCheck = isMouseLikePointerType(pointerType) ? floating : open;
			react.useEffect(() => {
				if (!enabled) {
					resetReference(domReference);
					return;
				}
				if (!openCheck) return;
				function cleanupListener() {
					cleanupListenerRef.current?.();
					cleanupListenerRef.current = null;
				}
				const win = getWindow(floating);
				function handleMouseMove(event) {
					const target = getTarget(event);
					if (!contains(floating, target)) setReference(event.clientX, event.clientY);
					else cleanupListener();
				}
				if (!dataRef.current.openEvent || isMouseBasedEvent(dataRef.current.openEvent)) cleanupListenerRef.current = addEventListener(win, "mousemove", handleMouseMove);
				else resetReference(domReference);
				return cleanupListener;
			}, [
				openCheck,
				enabled,
				floating,
				dataRef,
				domReference,
				store,
				setReference,
				resetReference,
				reactive
			]);
			react.useEffect(() => () => {
				store.set("positionReference", null);
			}, [store]);
			react.useEffect(() => {
				if (enabled && !floating) initialRef.current = false;
			}, [enabled, floating]);
			react.useEffect(() => {
				if (!enabled && open) initialRef.current = true;
			}, [enabled, open]);
			const reference = react.useMemo(() => {
				function setPointerTypeRef(event) {
					setPointerType(event.pointerType);
				}
				return {
					onPointerDown: setPointerTypeRef,
					onPointerEnter: setPointerTypeRef,
					onMouseMove: handleReferenceEnterOrMove,
					onMouseEnter: handleReferenceEnterOrMove
				};
			}, [handleReferenceEnterOrMove]);
			return react.useMemo(() => enabled ? {
				reference,
				trigger: reference
			} : {}, [enabled, reference]);
		}
		//#endregion
		//#region node_modules/.pnpm/@base-ui+react@1.9.0_@date-fns+tz@1.5.0_@types+react@18.3.31_date-fns@4.4.0_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/react/floating-ui-react/hooks/useDismiss.mjs
		function alwaysFalse() {
			return false;
		}
		function normalizeProp(normalizable) {
			return {
				escapeKey: typeof normalizable === "boolean" ? normalizable : normalizable?.escapeKey ?? false,
				outsidePress: typeof normalizable === "boolean" ? normalizable : normalizable?.outsidePress ?? true
			};
		}
		/**
		* Closes the floating element when a dismissal is requested — by default, when
		* the user presses the `escape` key or outside of the floating element.
		* @see https://floating-ui.com/docs/useDismiss
		*/
		function useDismiss(store, props = {}) {
			const { enabled = true, escapeKey: escapeKey$1 = true, outsidePress: outsidePressProp = true, outsidePressEvent = "sloppy", referencePress = alwaysFalse, bubbles, externalTree } = props;
			const open = store.useState("open");
			const floatingElement = store.useState("floatingElement");
			const { dataRef, events } = store.context;
			const tree = useFloatingTree(externalTree);
			const outsidePressFn = useStableCallback(typeof outsidePressProp === "function" ? outsidePressProp : () => false);
			const outsidePress$1 = typeof outsidePressProp === "function" ? outsidePressFn : outsidePressProp;
			const outsidePressEnabled = outsidePress$1 !== false;
			const getOutsidePressEventProp = useStableCallback(() => outsidePressEvent);
			const { escapeKey: escapeKeyBubbles, outsidePress: outsidePressBubbles } = normalizeProp(bubbles);
			const pressStartedInsideRef = react.useRef(false);
			const pressStartPreventedRef = react.useRef(false);
			const suppressNextOutsideClickRef = react.useRef(false);
			const sawPressWhileOpenRef = react.useRef(false);
			const isComposingRef = react.useRef(false);
			const currentPointerTypeRef = react.useRef("");
			const touchStateRef = react.useRef(null);
			const cancelDismissOnEndTimeout = useTimeout();
			const clearInsideReactTreeTimeout = useTimeout();
			const compositionTimeout = useTimeout();
			const clearInsideReactTree = useStableCallback(() => {
				clearInsideReactTreeTimeout.clear();
				dataRef.current.insideReactTree = false;
			});
			const hasBlockingChild = useStableCallback((bubbleKey) => {
				const nodeId = dataRef.current.floatingContext?.nodeId;
				return (tree ? getNodeChildren(tree.nodesRef.current, nodeId) : []).some((child) => child.context?.open && !child.context.dataRef.current[bubbleKey]);
			});
			const isEventWithinOwnElements = useStableCallback((event) => {
				return isEventTargetWithin(event, store.select("floatingElement")) || isEventTargetWithin(event, store.select("domReferenceElement"));
			});
			const closeOnReferencePress = useStableCallback((event) => {
				if (!referencePress()) return;
				store.setOpen(false, createChangeEventDetails(triggerPress, event.nativeEvent));
			});
			const closeOnEscapeKeyDown = useStableCallback((event) => {
				if (!open || !enabled || !escapeKey$1 || event.key !== "Escape") return;
				const native = isReactEvent(event) ? event.nativeEvent : event;
				if (isComposingRef.current || native.isComposing) return;
				if (!escapeKeyBubbles && hasBlockingChild("__escapeKeyBubbles")) return;
				const eventDetails = createChangeEventDetails(escapeKey, native);
				store.setOpen(false, eventDetails);
				if (!eventDetails.isCanceled) event.preventDefault();
				if (!escapeKeyBubbles && !eventDetails.isPropagationAllowed) event.stopPropagation();
			});
			const markInsideReactTree = useStableCallback(() => {
				dataRef.current.insideReactTree = true;
				clearInsideReactTreeTimeout.start(0, clearInsideReactTree);
			});
			const markPressStartedInsideReactTree = useStableCallback((event) => {
				if (!open || !enabled || event.button !== 0) return;
				const target = getTarget(event.nativeEvent);
				if (!contains(store.select("floatingElement"), target)) return;
				if (!pressStartedInsideRef.current) {
					pressStartedInsideRef.current = true;
					pressStartPreventedRef.current = false;
				}
			});
			const markInsidePressStartPrevented = useStableCallback((event) => {
				if (!open || !enabled) return;
				if (!(event.defaultPrevented || event.nativeEvent.defaultPrevented)) return;
				if (pressStartedInsideRef.current) pressStartPreventedRef.current = true;
			});
			react.useEffect(() => {
				function handleOpenChange(details) {
					if (!details.open) sawPressWhileOpenRef.current = false;
				}
				events.on("openchange", handleOpenChange);
				return () => {
					events.off("openchange", handleOpenChange);
				};
			}, [events]);
			react.useEffect(() => clearInsideReactTree, [clearInsideReactTree]);
			react.useEffect(() => {
				if (!open || !enabled) {
					if (!open) {
						sawPressWhileOpenRef.current = false;
						isComposingRef.current = false;
						currentPointerTypeRef.current = "";
						touchStateRef.current = null;
					}
					return clearInsideReactTree;
				}
				dataRef.current.__escapeKeyBubbles = escapeKeyBubbles;
				dataRef.current.__outsidePressBubbles = outsidePressBubbles;
				const preventedPressSuppressionTimeout = new Timeout();
				const doc = ownerDocument(floatingElement);
				function handleCompositionStart() {
					compositionTimeout.clear();
					isComposingRef.current = true;
				}
				function handleCompositionEnd() {
					isComposingRef.current = true;
					compositionTimeout.start(webkit ? 5 : 0, () => {
						isComposingRef.current = false;
					});
				}
				function suppressImmediateOutsideClickAfterPreventedStart() {
					suppressNextOutsideClickRef.current = true;
					preventedPressSuppressionTimeout.start(0, () => {
						suppressNextOutsideClickRef.current = false;
					});
				}
				function resetPressStartState() {
					pressStartedInsideRef.current = false;
					pressStartPreventedRef.current = false;
				}
				function getOutsidePressEvent() {
					const type = currentPointerTypeRef.current;
					const computedType = type === "pen" || !type ? "mouse" : type;
					const outsidePressEventValue = getOutsidePressEventProp();
					const resolved = typeof outsidePressEventValue === "function" ? outsidePressEventValue() : outsidePressEventValue;
					if (typeof resolved === "string") return resolved;
					return resolved[computedType];
				}
				function shouldIgnoreEvent(event) {
					const computedOutsidePressEvent = getOutsidePressEvent();
					return computedOutsidePressEvent === "intentional" && event.type !== "click" || computedOutsidePressEvent === "sloppy" && event.type === "click";
				}
				function isEventWithinFloatingTree(event) {
					const nodeId = dataRef.current.floatingContext?.nodeId;
					const targetIsInsideChildren = tree && getNodeChildren(tree.nodesRef.current, nodeId).some((node) => isEventTargetWithin(event, node.context?.elements.floating));
					return isEventWithinOwnElements(event) || targetIsInsideChildren;
				}
				function closeOnPressOutside(event) {
					if (shouldIgnoreEvent(event)) {
						if (event.type !== "click" && !isEventWithinOwnElements(event)) {
							preventedPressSuppressionTimeout.clear();
							suppressNextOutsideClickRef.current = false;
						}
						clearInsideReactTree();
						return;
					}
					if (dataRef.current.insideReactTree) {
						clearInsideReactTree();
						return;
					}
					const target = getTarget(event);
					const inertSelector = `[${createAttribute("inert")}]`;
					const targetRoot = isElement(target) ? target.getRootNode() : null;
					const markers = Array.from((isShadowRoot(targetRoot) ? targetRoot : ownerDocument(store.select("floatingElement"))).querySelectorAll(inertSelector));
					const triggers = store.context.triggerElements;
					if (target && (triggers.hasElement(target) || triggers.hasMatchingElement((trigger) => contains(trigger, target)))) return;
					let targetRootAncestor = isElement(target) ? target : null;
					while (targetRootAncestor && !isLastTraversableNode(targetRootAncestor)) {
						const nextParent = getParentNode(targetRootAncestor);
						if (isLastTraversableNode(nextParent) || !isElement(nextParent)) break;
						targetRootAncestor = nextParent;
					}
					if (markers.length && isElement(target) && !isRootElement(target) && !contains(target, store.select("floatingElement")) && markers.every((marker) => !contains(targetRootAncestor, marker))) return;
					if (isHTMLElement(target) && !("touches" in event)) {
						const lastTraversableNode = isLastTraversableNode(target);
						const style = getComputedStyle$1(target);
						const scrollRe = /auto|scroll/;
						const isScrollableX = lastTraversableNode || scrollRe.test(style.overflowX);
						const isScrollableY = lastTraversableNode || scrollRe.test(style.overflowY);
						const canScrollX = isScrollableX && target.clientWidth > 0 && target.scrollWidth > target.clientWidth;
						const canScrollY = isScrollableY && target.clientHeight > 0 && target.scrollHeight > target.clientHeight;
						const isRTL = style.direction === "rtl";
						const pressedVerticalScrollbar = canScrollY && (isRTL ? event.offsetX <= target.offsetWidth - target.clientWidth : event.offsetX > target.clientWidth);
						const pressedHorizontalScrollbar = canScrollX && event.offsetY > target.clientHeight;
						if (pressedVerticalScrollbar || pressedHorizontalScrollbar) return;
					}
					if (isEventWithinFloatingTree(event)) return;
					if (getOutsidePressEvent() === "intentional") {
						if (event.detail !== 0 && !isVirtualClick(event) && !sawPressWhileOpenRef.current) return;
						if (suppressNextOutsideClickRef.current) {
							preventedPressSuppressionTimeout.clear();
							suppressNextOutsideClickRef.current = false;
							return;
						}
					}
					if (typeof outsidePress$1 === "function" && !outsidePress$1(event)) return;
					if (hasBlockingChild("__outsidePressBubbles")) return;
					store.setOpen(false, createChangeEventDetails(outsidePress, event));
					clearInsideReactTree();
				}
				function handlePointerDown(event) {
					if (getOutsidePressEvent() !== "sloppy" || event.pointerType === "touch" || !store.select("open") || !enabled || isEventWithinOwnElements(event)) return;
					closeOnPressOutside(event);
				}
				function handleTouchStart(event) {
					if (getOutsidePressEvent() !== "sloppy" || !store.select("open") || !enabled || isEventWithinOwnElements(event)) return;
					const touch = event.touches[0];
					if (touch) {
						touchStateRef.current = {
							startTime: Date.now(),
							startX: touch.clientX,
							startY: touch.clientY,
							dismissOnTouchEnd: false,
							dismissOnMouseDown: true
						};
						cancelDismissOnEndTimeout.start(1e3, () => {
							if (touchStateRef.current) {
								touchStateRef.current.dismissOnTouchEnd = false;
								touchStateRef.current.dismissOnMouseDown = false;
							}
						});
					}
				}
				function addTargetEventListenerOnce(event, listener) {
					const target = getTarget(event);
					if (!target) return;
					const unsubscribe = addEventListener(target, event.type, () => {
						listener(event);
						unsubscribe();
					});
				}
				function handleTouchStartCapture(event) {
					currentPointerTypeRef.current = "touch";
					addTargetEventListenerOnce(event, handleTouchStart);
				}
				function closeOnPressOutsideCapture(event) {
					cancelDismissOnEndTimeout.clear();
					if (event.type === "pointerdown") {
						if (event.button === 0) sawPressWhileOpenRef.current = true;
						currentPointerTypeRef.current = event.pointerType;
					}
					if (event.type === "mousedown" && touchStateRef.current && !touchStateRef.current.dismissOnMouseDown) return;
					addTargetEventListenerOnce(event, (targetEvent) => {
						if (targetEvent.type === "pointerdown") handlePointerDown(targetEvent);
						else closeOnPressOutside(targetEvent);
					});
				}
				function handlePressEndCapture(event) {
					if (event.type === "pointercancel") sawPressWhileOpenRef.current = false;
					if (!pressStartedInsideRef.current) return;
					const pressStartedInsideDefaultPrevented = pressStartPreventedRef.current;
					resetPressStartState();
					if (getOutsidePressEvent() !== "intentional") return;
					if (event.type === "pointercancel") {
						if (pressStartedInsideDefaultPrevented) suppressImmediateOutsideClickAfterPreventedStart();
						return;
					}
					if (isEventWithinFloatingTree(event)) return;
					if (pressStartedInsideDefaultPrevented) {
						suppressImmediateOutsideClickAfterPreventedStart();
						return;
					}
					if (typeof outsidePress$1 === "function" && !outsidePress$1(event)) return;
					preventedPressSuppressionTimeout.clear();
					suppressNextOutsideClickRef.current = true;
					clearInsideReactTree();
				}
				function handleTouchMove(event) {
					if (getOutsidePressEvent() !== "sloppy" || !touchStateRef.current || isEventWithinOwnElements(event)) return;
					const touch = event.touches[0];
					if (!touch) return;
					const deltaX = Math.abs(touch.clientX - touchStateRef.current.startX);
					const deltaY = Math.abs(touch.clientY - touchStateRef.current.startY);
					const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
					if (distance > 5) touchStateRef.current.dismissOnTouchEnd = true;
					if (distance > 10) {
						closeOnPressOutside(event);
						cancelDismissOnEndTimeout.clear();
						touchStateRef.current = null;
					}
				}
				function handleTouchMoveCapture(event) {
					addTargetEventListenerOnce(event, handleTouchMove);
				}
				function handleTouchEnd(event) {
					if (getOutsidePressEvent() !== "sloppy" || !touchStateRef.current || isEventWithinOwnElements(event)) return;
					if (touchStateRef.current.dismissOnTouchEnd) closeOnPressOutside(event);
					cancelDismissOnEndTimeout.clear();
					touchStateRef.current = null;
				}
				function handleTouchEndCapture(event) {
					addTargetEventListenerOnce(event, handleTouchEnd);
				}
				const unsubscribe = mergeCleanups(escapeKey$1 && mergeCleanups(addEventListener(doc, "keydown", closeOnEscapeKeyDown), addEventListener(doc, "compositionstart", handleCompositionStart), addEventListener(doc, "compositionend", handleCompositionEnd)), outsidePressEnabled && mergeCleanups(addEventListener(doc, "click", closeOnPressOutsideCapture, true), addEventListener(doc, "pointerdown", closeOnPressOutsideCapture, true), addEventListener(doc, "pointerup", handlePressEndCapture, true), addEventListener(doc, "pointercancel", handlePressEndCapture, true), addEventListener(doc, "mousedown", closeOnPressOutsideCapture, true), addEventListener(doc, "mouseup", handlePressEndCapture, true), addEventListener(doc, "touchstart", handleTouchStartCapture, {
					capture: true,
					passive: true
				}), addEventListener(doc, "touchmove", handleTouchMoveCapture, {
					capture: true,
					passive: true
				}), addEventListener(doc, "touchend", handleTouchEndCapture, {
					capture: true,
					passive: true
				})));
				return () => {
					unsubscribe();
					preventedPressSuppressionTimeout.clear();
					resetPressStartState();
					suppressNextOutsideClickRef.current = false;
				};
			}, [
				dataRef,
				floatingElement,
				escapeKey$1,
				outsidePressEnabled,
				outsidePress$1,
				open,
				enabled,
				escapeKeyBubbles,
				outsidePressBubbles,
				closeOnEscapeKeyDown,
				clearInsideReactTree,
				getOutsidePressEventProp,
				hasBlockingChild,
				isEventWithinOwnElements,
				tree,
				store,
				cancelDismissOnEndTimeout,
				compositionTimeout
			]);
			const reference = react.useMemo(() => ({
				onKeyDown: closeOnEscapeKeyDown,
				onPointerDown: closeOnReferencePress,
				onClick: closeOnReferencePress
			}), [closeOnEscapeKeyDown, closeOnReferencePress]);
			const floating = react.useMemo(() => ({
				onKeyDown: closeOnEscapeKeyDown,
				onPointerDown: markInsidePressStartPrevented,
				onMouseDown: markInsidePressStartPrevented,
				onClickCapture: markInsideReactTree,
				onMouseDownCapture(event) {
					markInsideReactTree();
					markPressStartedInsideReactTree(event);
				},
				onPointerDownCapture(event) {
					markInsideReactTree();
					markPressStartedInsideReactTree(event);
				},
				onMouseUpCapture: markInsideReactTree,
				onTouchEndCapture: markInsideReactTree,
				onTouchMoveCapture: markInsideReactTree
			}), [
				closeOnEscapeKeyDown,
				markInsideReactTree,
				markPressStartedInsideReactTree,
				markInsidePressStartPrevented
			]);
			return react.useMemo(() => enabled ? {
				reference,
				floating,
				trigger: reference
			} : {}, [
				enabled,
				reference,
				floating
			]);
		}
		//#endregion
		//#region node_modules/.pnpm/@base-ui+react@1.9.0_@date-fns+tz@1.5.0_@types+react@18.3.31_date-fns@4.4.0_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/react/floating-ui-react/hooks/useSyncedFloatingRootContext.mjs
		/**
		* Narrowed to the store members this hook uses so consumers do not need to provide
		* unrelated store capabilities.
		*/
		/**
		* Keeps the provided FloatingRootStore in sync with the provided PopupStore.
		*/
		function useSyncedFloatingRootContext(options) {
			const { popupStore, treatPopupAsFloatingElement = false, floatingRootContext: store, floatingId, nested, onOpenChange } = options;
			const open = popupStore.useState("open");
			const referenceElement = popupStore.useState("activeTriggerElement");
			const floatingElement = popupStore.useState(treatPopupAsFloatingElement ? "popupElement" : "positionerElement");
			const handleOpenChange = onOpenChange;
			popupStore.useSyncedValue("floatingId", floatingId);
			useIsoLayoutEffect(() => {
				const valuesToSync = {
					open,
					floatingId,
					referenceElement,
					floatingElement
				};
				if (isElement(referenceElement)) valuesToSync.domReferenceElement = referenceElement;
				if (store.state.positionReference === store.state.referenceElement) valuesToSync.positionReference = referenceElement;
				store.update(valuesToSync);
			}, [
				open,
				floatingId,
				referenceElement,
				floatingElement,
				store
			]);
			store.context.onOpenChange = handleOpenChange;
			store.context.nested = nested;
			return store;
		}
		//#endregion
		//#region node_modules/.pnpm/@base-ui+react@1.9.0_@date-fns+tz@1.5.0_@types+react@18.3.31_date-fns@4.4.0_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/react/internals/useTransitionStatus.mjs
		/**
		* Provides a status string for CSS animations.
		* @param open - a boolean that determines if the element is open.
		* @param enableIdleState - a boolean that enables the `'idle'` state between `'starting'` and `'ending'`
		* @param deferEndingState - a boolean that delays the `'ending'` state by a frame
		* @param animateInitialOpen - a boolean that makes an element which mounts already open still go
		*   through `'starting'`. Off by default so content that was open on the first render (a
		*   `defaultOpen` popup on page load, SSR'd markup) doesn't animate in.
		*/
		function useTransitionStatus(open, enableIdleState = false, deferEndingState = false, animateInitialOpen = false) {
			const [transitionStatus, setTransitionStatus] = react.useState(open && enableIdleState ? "idle" : void 0);
			const [mounted, setMounted] = react.useState(open && !animateInitialOpen);
			if (open && !mounted) {
				setMounted(true);
				setTransitionStatus("starting");
			}
			if (!open && mounted && transitionStatus !== "ending" && !deferEndingState) setTransitionStatus("ending");
			if (!open && !mounted && transitionStatus === "ending") setTransitionStatus(void 0);
			useIsoLayoutEffect(() => {
				if (!open && mounted && transitionStatus !== "ending" && deferEndingState) {
					const frame = AnimationFrame.request(() => {
						setTransitionStatus("ending");
					});
					return () => {
						AnimationFrame.cancel(frame);
					};
				}
			}, [
				open,
				mounted,
				transitionStatus,
				deferEndingState
			]);
			useIsoLayoutEffect(() => {
				if (!open || enableIdleState || transitionStatus === void 0) return;
				const frame = AnimationFrame.request(() => {
					setTransitionStatus(void 0);
				});
				return () => {
					AnimationFrame.cancel(frame);
				};
			}, [
				enableIdleState,
				open,
				transitionStatus
			]);
			useIsoLayoutEffect(() => {
				if (!open || !enableIdleState) return;
				if (open && mounted && transitionStatus !== "idle") setTransitionStatus("starting");
				const frame = AnimationFrame.request(() => {
					setTransitionStatus("idle");
				});
				return () => {
					AnimationFrame.cancel(frame);
				};
			}, [
				enableIdleState,
				open,
				mounted,
				transitionStatus
			]);
			return {
				mounted,
				setMounted,
				transitionStatus
			};
		}
		//#endregion
		//#region node_modules/.pnpm/@base-ui+react@1.9.0_@date-fns+tz@1.5.0_@types+react@18.3.31_date-fns@4.4.0_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/react/utils/getFiniteAnimations.mjs
		/**
		* Excludes infinite animations, whose finished promises never resolve while they run.
		*/
		function getFiniteAnimations(element, options) {
			return element.getAnimations(options).filter((animation) => {
				const timing = animation.effect?.getTiming();
				return timing?.duration !== Infinity && timing?.iterations !== Infinity;
			});
		}
		//#endregion
		//#region node_modules/.pnpm/@base-ui+react@1.9.0_@date-fns+tz@1.5.0_@types+react@18.3.31_date-fns@4.4.0_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/react/internals/useAnimationsFinished.mjs
		let pendingCallbacks = null;
		/**
		* Runs the callback in a synchronous flush before the browser paints, so that the
		* browser doesn't paint an intermediate frame: https://github.com/mui/base-ui/issues/979
		* Callbacks that become ready within the same microtask checkpoint (e.g. multiple elements
		* whose animations finish together) are batched into a single commit:
		* https://github.com/mui/base-ui/issues/5481
		*/
		function flushBeforePaint(fn) {
			if (!pendingCallbacks) {
				const callbacks = [];
				pendingCallbacks = callbacks;
				queueMicrotask(() => {
					pendingCallbacks = null;
					react_dom.flushSync(() => {
						for (const callback of callbacks) callback();
					});
				});
			}
			pendingCallbacks.push(fn);
		}
		/**
		* Executes a function once all animations have finished on the provided element.
		* If an animation is canceled, waits for any replacement animations before executing.
		* @param elementOrRef - The element to watch for animations.
		* @param waitForStartingStyleRemoved - Whether to wait for [data-starting-style] to be removed before checking for animations.
		* @param batch - Whether completions ready in the same microtask may be coalesced into a single
		* commit. A batched callback runs before earlier callbacks' React updates have committed, so only
		* opt in when the callback doesn't read state that another completion can change.
		* @returns A function that takes a callback to execute once all animations have finished, and an optional AbortSignal to abort the callback
		*/
		function useAnimationsFinished(elementOrRef, waitForStartingStyleRemoved = false, batch = false) {
			const frame = useAnimationFrame();
			return useStableCallback((fnToExecute, signal = null) => {
				frame.cancel();
				const element = resolveRef(elementOrRef);
				if (element == null) return;
				const resolvedElement = element;
				const done = () => {
					if (!batch) {
						react_dom.flushSync(fnToExecute);
						return;
					}
					flushBeforePaint(() => {
						if (!signal?.aborted) fnToExecute();
					});
				};
				if (typeof resolvedElement.getAnimations !== "function" || globalThis.BASE_UI_ANIMATIONS_DISABLED) {
					fnToExecute();
					return;
				}
				function exec() {
					Promise.all(getFiniteAnimations(resolvedElement).map((animation) => animation.finished.then(NOOP))).then(() => {
						if (!signal?.aborted) done();
					}, () => {
						if (signal?.aborted) return;
						if (getFiniteAnimations(resolvedElement).some((animation) => animation.pending || animation.playState !== "finished")) {
							exec();
							return;
						}
						done();
					});
				}
				if (waitForStartingStyleRemoved) {
					const startingStyleAttribute = startingStyle;
					if (!resolvedElement.hasAttribute(startingStyleAttribute)) {
						frame.request(exec);
						return;
					}
					const attributeObserver = new MutationObserver(() => {
						if (!resolvedElement.hasAttribute(startingStyleAttribute)) {
							attributeObserver.disconnect();
							exec();
						}
					});
					attributeObserver.observe(resolvedElement, {
						attributes: true,
						attributeFilter: [startingStyleAttribute]
					});
					signal?.addEventListener("abort", () => attributeObserver.disconnect(), { once: true });
					return;
				}
				frame.request(exec);
			});
		}
		//#endregion
		//#region node_modules/.pnpm/@base-ui+react@1.9.0_@date-fns+tz@1.5.0_@types+react@18.3.31_date-fns@4.4.0_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/react/internals/useOpenChangeComplete.mjs
		/**
		* Calls the provided function when the CSS open/close animation or transition completes.
		*/
		function useOpenChangeComplete(parameters) {
			const { enabled = true, open, ref, batch = false, onComplete: onCompleteParam } = parameters;
			const onComplete = useStableCallback(onCompleteParam);
			const runOnceAnimationsFinish = useAnimationsFinished(ref, open, batch);
			react.useEffect(() => {
				if (!enabled) return;
				const abortController = new AbortController();
				runOnceAnimationsFinish(onComplete, abortController.signal);
				return () => {
					abortController.abort();
				};
			}, [
				enabled,
				open,
				onComplete,
				runOnceAnimationsFinish
			]);
		}
		//#endregion
		//#region node_modules/.pnpm/@base-ui+react@1.9.0_@date-fns+tz@1.5.0_@types+react@18.3.31_date-fns@4.4.0_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/react/internals/useUnmountAfterClose.mjs
		/**
		* Keeps a popup mounted through its closing animation and unmounts it once the animation
		* finishes, unless the close cycle opted out through `preventUnmountOnClose`.
		* Store-agnostic: hosts sync `mounted` and `transitionStatus` wherever they need them.
		*
		* @returns `forceUnmount` unmounts the popup immediately. It is a no-op once the popup is already
		*   unmounted, so calling it after the automatic unmount doesn't repeat the completion callback,
		*   and a call while the popup is open only takes effect if a close commits in the same batch.
		*/
		function useUnmountAfterClose(parameters) {
			const { open, ref, preventUnmountOnClose, setPreventUnmountOnClose: setPreventUnmountOnCloseParam, onUnmount, animateInitialOpen } = parameters;
			const setPreventUnmountOnClose = useStableCallback(setPreventUnmountOnCloseParam);
			const { mounted, setMounted, transitionStatus } = useTransitionStatus(open, false, false, animateInitialOpen);
			const preventUnmountingOnClose = open ? false : preventUnmountOnClose;
			useIsoLayoutEffect(() => {
				if (open) setPreventUnmountOnClose(false);
			}, [open, setPreventUnmountOnClose]);
			const mountedRef = react.useRef(mounted);
			const pendingUnmountRef = react.useRef(false);
			const rerender = useForcedRerendering();
			const unmount = () => {
				mountedRef.current = false;
				setMounted(false);
				onUnmount();
			};
			useIsoLayoutEffect(() => {
				mountedRef.current = mounted;
				if (pendingUnmountRef.current) {
					pendingUnmountRef.current = false;
					if (!open && mounted) unmount();
				}
			});
			const forceUnmount = useStableCallback(() => {
				if (!mountedRef.current) return;
				if (open) {
					pendingUnmountRef.current = true;
					rerender();
					return;
				}
				unmount();
			});
			useOpenChangeComplete({
				enabled: mounted && !open && !preventUnmountingOnClose,
				open,
				ref,
				onComplete() {
					if (!open) forceUnmount();
				}
			});
			return {
				mounted,
				transitionStatus,
				preventUnmountingOnClose,
				forceUnmount
			};
		}
		//#endregion
		//#region node_modules/.pnpm/@base-ui+react@1.9.0_@date-fns+tz@1.5.0_@types+react@18.3.31_date-fns@4.4.0_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/react/utils/popups/popupStoreUtils.mjs
		const FOCUSABLE_POPUP_PROPS = {
			tabIndex: -1,
			[FOCUSABLE_ATTRIBUTE]: ""
		};
		/**
		* The subset of a popup handle that a Root needs to bind its store to. Both the real handle classes
		* and any test double satisfy it.
		*/
		/**
		* Creates and owns a popup store on behalf of a Root part. The store is created exactly once, with
		* controlled props and root state synced separately after creation. Sets up the synced floating
		* root context and returns the store.
		*
		* @param createStore Factory that builds the store. Called exactly once, receiving the floating id
		* and whether the popup is nested inside another floating element, both resolved on the first render.
		* @param treatPopupAsFloatingElement Whether the popup element is passed to Floating UI as the
		* floating element instead of the default positioner.
		*/
		function usePopupRootStore(createStore, treatPopupAsFloatingElement = false) {
			const floatingId = useId$6();
			const nested = useFloatingParentNodeId() != null;
			const store = useRefWithInit(() => createStore(floatingId, nested)).current;
			useSyncedFloatingRootContext({
				popupStore: store,
				treatPopupAsFloatingElement,
				floatingRootContext: store.state.floatingRootContext,
				floatingId,
				nested,
				onOpenChange: store.setOpen
			});
			return store;
		}
		/**
		* Attaches a Root's store to a handle for this component's committed lifetime. Popup Roots render
		* it before their interactions and user children so its layout effect runs before descendant layout
		* effects. This lets descendants call the handle during the Root's initial commit without attaching
		* during render, which would leak suspended or abandoned stores. Store subscribers are notified by
		* `attachStore` in this ordinary layout phase, where React permits synchronous updates.
		*
		* Popup Roots must render this component only when a handle is present so handle-less Roots avoid
		* mounting an extra fiber and layout effect.
		*/
		function PopupHandleAttachment({ handle, store }) {
			useIsoLayoutEffect(() => {
				return handle.attachStore(store);
			}, [handle, store]);
			return null;
		}
		function syncTriggerCount(store) {
			const triggerCount = store.context.triggerElements.size;
			if (store.select("open") && store.state.triggerCount !== triggerCount) store.set("triggerCount", triggerCount);
		}
		/**
		* Returns a stable callback ref that registers/unregisters the trigger element in the store.
		*
		* Stable so a downstream ref merger that retains the callback it was first given still reaches the
		* trigger's current store. The registration is tracked as a `(store, id, element)` triple, so
		* unregistering targets the store the element was actually registered in.
		*
		* Since the callback never changes, the caller must re-run it from a layout effect keyed on
		* `[store, id]` to migrate an already-registered element. That effect is also what registers the
		* element in the first place when `id` only resolves after the first commit (React 17's `useId`
		* fallback), because the register call made while the id is still `undefined` does nothing.
		*
		* @param id Id of the trigger.
		* @param store The Store instance where the trigger should be registered.
		*/
		function useTriggerRegistration(id, store) {
			const registrationRef = react.useRef(null);
			return useStableCallback((element) => {
				const registration = registrationRef.current;
				if (registration !== null) {
					if (registration.element === element && registration.store === store && registration.id === id) return;
					registrationRef.current = null;
					const registeredStore = registration.store;
					if (registeredStore.context.triggerElements.getById(registration.id) === registration.element) {
						registeredStore.context.triggerElements.delete(registration.id);
						syncTriggerCount(registeredStore);
					}
				}
				if (element !== null && id !== void 0) {
					registrationRef.current = {
						store,
						id,
						element
					};
					store.context.triggerElements.add(id, element);
					syncTriggerCount(store);
				}
			});
		}
		function createPopupOpenState(state, open, trigger, preventUnmountOnClose = false) {
			let preventUnmountingOnClose = state.preventUnmountingOnClose;
			if (open) preventUnmountingOnClose = false;
			else if (preventUnmountOnClose) preventUnmountingOnClose = true;
			const triggerId = trigger?.id ?? null;
			let activeTriggerId = state.activeTriggerId;
			let activeTriggerElement = state.activeTriggerElement;
			if (triggerId || open) {
				activeTriggerId = triggerId;
				activeTriggerElement = trigger ?? null;
			}
			return {
				open,
				preventUnmountingOnClose,
				activeTriggerId,
				activeTriggerElement,
				openedWithoutTrigger: open ? trigger == null : state.openedWithoutTrigger
			};
		}
		function attachPreventUnmountOnClose(eventDetails) {
			let preventUnmountOnClose = false;
			eventDetails.preventUnmountOnClose = () => {
				preventUnmountOnClose = true;
			};
			return () => preventUnmountOnClose;
		}
		/**
		* Runs the shared open-change sequence for a popup store: notifies `onOpenChange`,
		* honors cancellation, dispatches the floating root change, maps the reason to an
		* `instantType`, and commits the state update (synchronously for hover so
		* `getAnimations()` observes it). Stores supply their own differences via
		* `extraState` (e.g. the last change reason) and `onBeforeDispatch` (e.g. updating
		* inline-rect coordinates).
		*/
		function applyPopupOpenChange(store, nextOpen, eventDetails, options = {}) {
			const reason = eventDetails.reason;
			const isHover = reason === triggerHover;
			const isFocusOpen = nextOpen && reason === "trigger-focus";
			const isDismissClose = !nextOpen && (reason === "trigger-press" || reason === "escape-key");
			const shouldPreventUnmountOnClose = attachPreventUnmountOnClose(eventDetails);
			store.context.onOpenChange?.(nextOpen, eventDetails);
			if (eventDetails.isCanceled) return;
			options.onBeforeDispatch?.();
			store.state.floatingRootContext.dispatchOpenChange(nextOpen, eventDetails);
			const changeState = () => {
				const popupOpenState = createPopupOpenState(store.state, nextOpen, eventDetails.trigger, shouldPreventUnmountOnClose());
				const updatedState = {
					...options.extraState,
					...popupOpenState
				};
				if (isFocusOpen) updatedState.instantType = "focus";
				else if (isDismissClose) updatedState.instantType = "dismiss";
				else if (isHover) updatedState.instantType = void 0;
				store.update(updatedState);
			};
			if (isHover) react_dom.flushSync(changeState);
			else changeState();
		}
		/**
		* Sets up trigger data forwarding to the store.
		*
		* @param triggerId Id of the trigger.
		* @param triggerElementRef Ref for the trigger DOM element.
		* @param store The Store instance managing the popup state.
		* @param stateUpdates An object with state updates to apply when the trigger is active.
		*/
		function useTriggerDataForwarding(triggerId, triggerElementRef, store, stateUpdates) {
			const isMountedByThisTrigger = store.useState("isMountedByTrigger", triggerId);
			const baseRegisterTrigger = useTriggerRegistration(triggerId, store);
			const applyTriggerData = useStableCallback((element) => {
				const open = store.select("open");
				const activeTriggerId = store.select("activeTriggerId");
				if (activeTriggerId === triggerId) {
					const changes = {
						activeTriggerElement: element,
						...open ? stateUpdates : null
					};
					store.update(changes);
					return;
				}
				if (activeTriggerId == null && open && !store.state.openedWithoutTrigger) {
					const changes = {
						activeTriggerId: triggerId ?? null,
						activeTriggerElement: element,
						...stateUpdates
					};
					store.update(changes);
				}
			});
			const registerTrigger = useStableCallback((element) => {
				baseRegisterTrigger(element);
				if (element) applyTriggerData(element);
			});
			useIsoLayoutEffect(() => {
				registerTrigger(triggerElementRef.current);
				return () => registerTrigger(null);
			}, [
				registerTrigger,
				triggerElementRef,
				store,
				triggerId
			]);
			useIsoLayoutEffect(() => {
				if (isMountedByThisTrigger) {
					const changes = {
						activeTriggerElement: triggerElementRef.current,
						...stateUpdates
					};
					store.update(changes);
				}
			}, [
				isMountedByThisTrigger,
				store,
				triggerElementRef,
				...Object.values(stateUpdates)
			]);
			return {
				registerTrigger,
				isMountedByThisTrigger
			};
		}
		/**
		* Keeps trigger registration state synchronized while the popup is open.
		*
		* When a popup opens without an explicit trigger id and exactly one trigger is registered, that
		* trigger is claimed as the active trigger, unless the open request deliberately carried no trigger
		* (`openedWithoutTrigger`). When the active trigger id is still registered but its
		* element changed, the active element is refreshed. When the active trigger id is missing from the
		* registry but the same element is still registered under a different id (e.g. the rendered trigger
		* carries its own DOM `id` that differs from Base UI's internal trigger id), the active id is
		* reassociated to the registered id instead of being treated as lost. When the active trigger
		* unregisters, the default path preserves existing ownership so non-closing popup families do not
		* silently claim a different trigger while staying open.
		*
		* If `closeOnActiveTriggerUnmount` is enabled, unregistering a previously resolved active trigger
		* requests a close after a microtask so a same-tick replacement trigger with the same id can
		* register first. An active trigger id that has not matched a registered trigger yet is treated as
		* pending and does not request a close.
		*
		* This should be called on the Root part.
		*
		* @param store The Store instance managing the popup state.
		* @param options Options for active trigger unmount behavior.
		*/
		function useImplicitActiveTrigger(store, options = {}) {
			const { closeOnActiveTriggerUnmount = false } = options;
			const resolvedActiveTriggerIdRef = react.useRef(null);
			const open = store.useState("open");
			const reactiveTriggerCount = store.useState("triggerCount");
			const activeTriggerId = store.useState("activeTriggerId");
			const reactiveActiveTriggerElement = store.useState("activeTriggerElement");
			useIsoLayoutEffect(() => {
				if (!open) {
					resolvedActiveTriggerIdRef.current = null;
					if (store.state.triggerCount !== 0) store.set("triggerCount", 0);
					if (store.state.openedWithoutTrigger) store.set("openedWithoutTrigger", false);
					return;
				}
				const triggerCount = store.context.triggerElements.size;
				const stateUpdates = {};
				if (store.state.triggerCount !== triggerCount) stateUpdates.triggerCount = triggerCount;
				const currentActiveTriggerId = store.select("activeTriggerId");
				let lostActiveTriggerId = null;
				if (currentActiveTriggerId) {
					const activeTriggerElement = store.context.triggerElements.getById(currentActiveTriggerId);
					if (!activeTriggerElement) {
						for (const [triggerId, triggerElement] of store.context.triggerElements.entries()) if (triggerElement === store.state.activeTriggerElement) {
							stateUpdates.activeTriggerId = triggerId;
							stateUpdates.activeTriggerElement = triggerElement;
							resolvedActiveTriggerIdRef.current = triggerId;
							break;
						}
						if (stateUpdates.activeTriggerId === void 0) {
							if (resolvedActiveTriggerIdRef.current === currentActiveTriggerId) lostActiveTriggerId = currentActiveTriggerId;
							else resolvedActiveTriggerIdRef.current = null;
						}
					} else {
						resolvedActiveTriggerIdRef.current = currentActiveTriggerId;
						if (activeTriggerElement !== store.state.activeTriggerElement) stateUpdates.activeTriggerElement = activeTriggerElement;
					}
				} else resolvedActiveTriggerIdRef.current = null;
				if (!lostActiveTriggerId && !currentActiveTriggerId && !store.state.openedWithoutTrigger && triggerCount === 1) {
					const iteratorResult = store.context.triggerElements.entries().next();
					if (!iteratorResult.done) {
						const [implicitTriggerId, implicitTriggerElement] = iteratorResult.value;
						stateUpdates.activeTriggerId = implicitTriggerId;
						stateUpdates.activeTriggerElement = implicitTriggerElement;
						resolvedActiveTriggerIdRef.current = implicitTriggerId;
					}
				}
				if (stateUpdates.triggerCount !== void 0 || stateUpdates.activeTriggerId !== void 0 || stateUpdates.activeTriggerElement !== void 0) store.update(stateUpdates);
				if (lostActiveTriggerId) {
					if (closeOnActiveTriggerUnmount) queueMicrotask(() => {
						if (store.select("open") && store.select("activeTriggerId") === lostActiveTriggerId && !store.context.triggerElements.getById(lostActiveTriggerId)) {
							const eventDetails = createChangeEventDetails(none);
							store.setOpen(false, eventDetails);
							if (!eventDetails.isCanceled) store.update({
								activeTriggerId: null,
								activeTriggerElement: null
							});
						}
					});
				}
			}, [
				open,
				store,
				reactiveTriggerCount,
				activeTriggerId,
				reactiveActiveTriggerElement,
				closeOnActiveTriggerUnmount
			]);
		}
		/**
		* Manages the mounted state of the popup.
		* Sets up the transition status listeners and handles unmounting when needed.
		* Updates the `mounted`, `transitionStatus`, and `preventUnmountingOnClose` states in the store.
		*
		* @param open Whether the popup is open.
		* @param store The Store instance managing the popup state.
		* @param onUnmount Optional callback to be called when the popup is unmounted.
		* @param animateInitialOpen Whether a popup that mounts already open should still play its enter
		*   transition. Defaults to `false`, so content that was open on the first render (a `defaultOpen`
		*   popup on page load, SSR'd markup) appears without animating. Opt in for popups whose subtree
		*   only mounts in response to something the user did, such as a submenu inside a menu popup.
		*
		* @returns A function to forcibly unmount the popup. It is a no-op once the popup is already
		*   unmounted, so calling it after the automatic unmount doesn't repeat the completion callback.
		*/
		function useOpenStateTransitions(open, store, onUnmount, animateInitialOpen) {
			const { mounted, transitionStatus, forceUnmount } = useUnmountAfterClose({
				open,
				ref: store.context.popupRef,
				preventUnmountOnClose: store.useState("preventUnmountingOnClose"),
				setPreventUnmountOnClose: (preventUnmountOnClose) => store.set("preventUnmountingOnClose", preventUnmountOnClose),
				animateInitialOpen,
				onUnmount() {
					store.update({
						activeTriggerId: null,
						activeTriggerElement: null,
						mounted: false,
						preventUnmountingOnClose: false
					});
					onUnmount?.();
					store.context.onOpenChangeComplete?.(false);
				}
			});
			useRefWithInit(() => {
				store.set("mounted", mounted);
				return null;
			});
			store.useSyncedValues({
				mounted,
				transitionStatus
			});
			return {
				forceUnmount,
				transitionStatus
			};
		}
		function usePopupInteractionProps(store, statePart) {
			store.useSyncedValues(statePart);
			useIsoLayoutEffect(() => () => {
				store.update({
					activeTriggerProps: EMPTY_OBJECT,
					inactiveTriggerProps: EMPTY_OBJECT,
					popupProps: EMPTY_OBJECT
				});
			}, [store]);
		}
		//#endregion
		//#region node_modules/.pnpm/@base-ui+react@1.9.0_@date-fns+tz@1.5.0_@types+react@18.3.31_date-fns@4.4.0_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/react/utils/popups/popupTriggerMap.mjs
		/**
		* Data structure to keep track of popup trigger elements by their IDs.
		*
		* Element lookups iterate the id map rather than maintaining a parallel Set. Registration is O(1),
		* while `hasElement` and `hasMatchingElement` are linear in the number of triggers.
		*/
		var PopupTriggerMap = class {
			idMap = /* @__PURE__ */ new Map();
			/**
			* Adds a trigger element with the given ID.
			*
			* Note: The provided element is assumed to not be registered under multiple IDs.
			*/
			add(id, element) {
				this.idMap.set(id, element);
			}
			/**
			* Removes the trigger element with the given ID.
			*/
			delete(id) {
				this.idMap.delete(id);
			}
			/**
			* Whether the given element is registered as a trigger.
			*/
			hasElement(element) {
				for (const registered of this.idMap.values()) if (registered === element) return true;
				return false;
			}
			/**
			* Whether there is a registered trigger element matching the given predicate.
			*/
			hasMatchingElement(predicate) {
				for (const element of this.idMap.values()) if (predicate(element)) return true;
				return false;
			}
			/**
			* Returns the trigger element associated with the given ID, or undefined if no such element exists.
			*/
			getById(id) {
				return this.idMap.get(id);
			}
			/**
			* Returns an iterable of all registered trigger entries, where each entry is a tuple of [id, element].
			*/
			entries() {
				return this.idMap.entries();
			}
			/**
			* Returns an iterable of all registered trigger elements.
			*/
			elements() {
				return this.idMap.values();
			}
			/**
			* Returns the number of registered trigger elements.
			*/
			get size() {
				return this.idMap.size;
			}
		};
		//#endregion
		//#region node_modules/.pnpm/use-sync-external-store@1.7.0_react@18.3.1/node_modules/use-sync-external-store/cjs/use-sync-external-store-shim.production.js
		/**
		* @license React
		* use-sync-external-store-shim.production.js
		*
		* Copyright (c) Meta Platforms, Inc. and affiliates.
		*
		* This source code is licensed under the MIT license found in the
		* LICENSE file in the root directory of this source tree.
		*/
		var require_use_sync_external_store_shim_production = /* @__PURE__ */ __commonJSMin(((exports) => {
			var React$1 = require("react");
			function is(x, y) {
				return x === y && (0 !== x || 1 / x === 1 / y) || x !== x && y !== y;
			}
			var objectIs = "function" === typeof Object.is ? Object.is : is;
			var useState = React$1.useState;
			var useEffect = React$1.useEffect;
			var useLayoutEffect = React$1.useLayoutEffect;
			var useDebugValue = React$1.useDebugValue;
			function useSyncExternalStore$2(subscribe, getSnapshot) {
				var value = getSnapshot(), _useState = useState({ inst: {
					value,
					getSnapshot
				} }), inst = _useState[0].inst, forceUpdate = _useState[1];
				useLayoutEffect(function() {
					inst.value = value;
					inst.getSnapshot = getSnapshot;
					checkIfSnapshotChanged(inst) && forceUpdate({ inst });
				}, [
					subscribe,
					value,
					getSnapshot
				]);
				useEffect(function() {
					checkIfSnapshotChanged(inst) && forceUpdate({ inst });
					return subscribe(function() {
						checkIfSnapshotChanged(inst) && forceUpdate({ inst });
					});
				}, [subscribe]);
				useDebugValue(value);
				return value;
			}
			function checkIfSnapshotChanged(inst) {
				var latestGetSnapshot = inst.getSnapshot;
				inst = inst.value;
				try {
					var nextValue = latestGetSnapshot();
					return !objectIs(inst, nextValue);
				} catch (error) {
					return !0;
				}
			}
			function useSyncExternalStore$1(subscribe, getSnapshot) {
				return getSnapshot();
			}
			var shim = "undefined" === typeof window || "undefined" === typeof window.document || "undefined" === typeof window.document.createElement ? useSyncExternalStore$1 : useSyncExternalStore$2;
			exports.useSyncExternalStore = void 0 !== React$1.useSyncExternalStore ? React$1.useSyncExternalStore : shim;
		}));
		//#endregion
		//#region node_modules/.pnpm/use-sync-external-store@1.7.0_react@18.3.1/node_modules/use-sync-external-store/shim/index.js
		var require_shim = /* @__PURE__ */ __commonJSMin(((exports, module) => {
			module.exports = require_use_sync_external_store_shim_production();
		}));
		//#endregion
		//#region node_modules/.pnpm/use-sync-external-store@1.7.0_react@18.3.1/node_modules/use-sync-external-store/cjs/use-sync-external-store-shim/with-selector.production.js
		/**
		* @license React
		* use-sync-external-store-shim/with-selector.production.js
		*
		* Copyright (c) Meta Platforms, Inc. and affiliates.
		*
		* This source code is licensed under the MIT license found in the
		* LICENSE file in the root directory of this source tree.
		*/
		var require_with_selector_production = /* @__PURE__ */ __commonJSMin(((exports) => {
			var React = require("react");
			var shim = require_shim();
			function is(x, y) {
				return x === y && (0 !== x || 1 / x === 1 / y) || x !== x && y !== y;
			}
			var objectIs = "function" === typeof Object.is ? Object.is : is;
			var useSyncExternalStore = shim.useSyncExternalStore;
			var useRef = React.useRef;
			var useEffect = React.useEffect;
			var useMemo = React.useMemo;
			var useDebugValue = React.useDebugValue;
			exports.useSyncExternalStoreWithSelector = function(subscribe, getSnapshot, getServerSnapshot, selector, isEqual) {
				var instRef = useRef(null);
				if (null === instRef.current) {
					var inst = {
						hasValue: !1,
						value: null
					};
					instRef.current = inst;
				} else inst = instRef.current;
				instRef = useMemo(function() {
					function memoizedSelector(nextSnapshot) {
						if (!hasMemo) {
							hasMemo = !0;
							memoizedSnapshot = nextSnapshot;
							nextSnapshot = selector(nextSnapshot);
							if (void 0 !== isEqual && inst.hasValue) {
								var currentSelection = inst.value;
								if (isEqual(currentSelection, nextSnapshot)) return memoizedSelection = currentSelection;
							}
							return memoizedSelection = nextSnapshot;
						}
						currentSelection = memoizedSelection;
						if (objectIs(memoizedSnapshot, nextSnapshot)) return currentSelection;
						var nextSelection = selector(nextSnapshot);
						if (void 0 !== isEqual && isEqual(currentSelection, nextSelection)) return memoizedSnapshot = nextSnapshot, currentSelection;
						memoizedSnapshot = nextSnapshot;
						return memoizedSelection = nextSelection;
					}
					var hasMemo = !1, memoizedSnapshot, memoizedSelection, maybeGetServerSnapshot = void 0 === getServerSnapshot ? null : getServerSnapshot;
					return [function() {
						return memoizedSelector(getSnapshot());
					}, null === maybeGetServerSnapshot ? void 0 : function() {
						return memoizedSelector(maybeGetServerSnapshot());
					}];
				}, [
					getSnapshot,
					getServerSnapshot,
					selector,
					isEqual
				]);
				var value = useSyncExternalStore(subscribe, instRef[0], instRef[1]);
				useEffect(function() {
					inst.hasValue = !0;
					inst.value = value;
				}, [value]);
				useDebugValue(value);
				return value;
			};
		}));
		//#endregion
		//#region node_modules/.pnpm/use-sync-external-store@1.7.0_react@18.3.1/node_modules/use-sync-external-store/shim/with-selector.js
		var require_with_selector = /* @__PURE__ */ __commonJSMin(((exports, module) => {
			module.exports = require_with_selector_production();
		}));
		//#endregion
		//#region node_modules/.pnpm/@base-ui+utils@0.5.0_@types+react@18.3.31_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/utils/store/useStore.mjs
		var import_shim = require_shim();
		var import_with_selector = require_with_selector();
		const useStoreImplementation = isReactVersionAtLeast(19) ? useStoreFast : useStoreLegacy;
		function useStore(store, selector, a1, a2, a3) {
			return useStoreImplementation(store, selector, a1, a2, a3);
		}
		function useStoreR19(store, selector, a1, a2, a3) {
			const getSelection = react.useCallback(() => selector(store.getSnapshot(), a1, a2, a3), [
				store,
				selector,
				a1,
				a2,
				a3
			]);
			return (0, import_shim.useSyncExternalStore)(store.subscribe, getSelection, getSelection);
		}
		register({
			before(instance) {
				instance.syncIndex = 0;
				if (!instance.didInitialize) {
					instance.syncTick = 1;
					instance.syncHooks = [];
					instance.didChangeStore = true;
					instance.getSnapshot = () => {
						let didChange = false;
						for (let i = 0; i < instance.syncHooks.length; i += 1) {
							const hook = instance.syncHooks[i];
							const value = hook.selector(hook.store.state, hook.a1, hook.a2, hook.a3);
							if (!Object.is(hook.value, value)) {
								didChange = true;
								hook.value = value;
							}
						}
						if (didChange) instance.syncTick += 1;
						return instance.syncTick;
					};
				}
			},
			after(instance) {
				if (instance.syncHooks.length > 0) {
					if (instance.didChangeStore) {
						instance.didChangeStore = false;
						instance.subscribe = (onStoreChange) => {
							const stores = /* @__PURE__ */ new Set();
							for (const hook of instance.syncHooks) stores.add(hook.store);
							const unsubscribes = [];
							for (const store of stores) unsubscribes.push(store.subscribe(onStoreChange));
							return () => {
								for (const unsubscribe of unsubscribes) unsubscribe();
							};
						};
					}
					(0, import_shim.useSyncExternalStore)(instance.subscribe, instance.getSnapshot, instance.getSnapshot);
				}
			}
		});
		function useStoreFast(store, selector, a1, a2, a3) {
			const instance = getInstance();
			if (!instance) return useStoreR19(store, selector, a1, a2, a3);
			const index = instance.syncIndex;
			instance.syncIndex += 1;
			let hook;
			if (!instance.didInitialize) {
				hook = {
					store,
					selector,
					a1,
					a2,
					a3,
					value: selector(store.getSnapshot(), a1, a2, a3)
				};
				instance.syncHooks.push(hook);
			} else {
				hook = instance.syncHooks[index];
				if (hook.store !== store || hook.selector !== selector || !Object.is(hook.a1, a1) || !Object.is(hook.a2, a2) || !Object.is(hook.a3, a3)) {
					if (hook.store !== store) instance.didChangeStore = true;
					hook.store = store;
					hook.selector = selector;
					hook.a1 = a1;
					hook.a2 = a2;
					hook.a3 = a3;
					hook.value = selector(store.getSnapshot(), a1, a2, a3);
				}
			}
			return hook.value;
		}
		function useStoreLegacy(store, selector, a1, a2, a3) {
			return (0, import_with_selector.useSyncExternalStoreWithSelector)(store.subscribe, store.getSnapshot, store.getSnapshot, (state) => selector(state, a1, a2, a3));
		}
		//#endregion
		//#region node_modules/.pnpm/@base-ui+utils@0.5.0_@types+react@18.3.31_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/utils/store/Store.mjs
		/**
		* A data store implementation that allows subscribing to state changes and updating the state.
		* It uses an observer pattern to notify subscribers when the state changes.
		*/
		var Store = class {
			/**
			* Creates a store with the given initial state, constructing the class it is called on.
			* Calling it on a generic base class (e.g. `ReactStore.create(...)`) constructs that
			* class but degrades the inferred instance type to `Store`; use `new` there instead.
			*/
			static create(state) {
				return new this(state);
			}
			/**
			* The current state of the store.
			* This property is updated immediately when the state changes as a result of calling {@link setState}, {@link update}, or {@link set}.
			* To subscribe to state changes, use the {@link useState} method. The value returned by {@link useState} is updated after the component renders (similarly to React's useState).
			* The values can be used directly (to avoid subscribing to the store) in effects or event handlers.
			*
			* Do not modify properties in state directly. Instead, use the provided methods to ensure proper state management and listener notification.
			*/
			constructor(state) {
				this.state = state;
				this.listeners = /* @__PURE__ */ new Set();
				this.updateTick = 0;
			}
			/**
			* Registers a listener that will be called whenever the store's state changes.
			*
			* @param fn The listener function to be called on state changes.
			* @returns A function to unsubscribe the listener.
			*/
			subscribe = (fn) => {
				this.listeners.add(fn);
				return () => {
					this.listeners.delete(fn);
				};
			};
			/**
			* Returns the current state of the store.
			*/
			getSnapshot = () => {
				return this.state;
			};
			/**
			* Updates the entire store's state and notifies all registered listeners.
			*
			* @param newState The new state to set for the store.
			*/
			setState(newState) {
				if (this.state === newState) return;
				this.state = newState;
				this.updateTick += 1;
				const currentTick = this.updateTick;
				for (const listener of this.listeners) {
					if (currentTick !== this.updateTick) return;
					listener(newState);
				}
			}
			/**
			* Merges the provided changes into the current state and notifies listeners if there are changes.
			* Each value must match its state key. Pass an exact known subset rather than a broad
			* `Partial<State>`, which may contain `undefined` for required state fields.
			*
			* @param changes An object containing the changes to apply to the current state.
			*/
			update(changes) {
				for (const key in changes) if (!Object.is(this.state[key], changes[key])) {
					this.setState({
						...this.state,
						...changes
					});
					return;
				}
			}
			/**
			* Sets a specific key in the store's state to a new value and notifies listeners if the value has changed.
			*
			* @param key The key in the store's state to update.
			* @param value The new value to set for the specified key.
			*/
			set(key, value) {
				if (!Object.is(this.state[key], value)) this.setState({
					...this.state,
					[key]: value
				});
			}
			/**
			* Gives the state a new reference and updates all registered listeners.
			*/
			notifyAll() {
				const newState = { ...this.state };
				this.setState(newState);
			}
			use(selector, a1, a2, a3) {
				return useStore(this, selector, a1, a2, a3);
			}
		};
		//#endregion
		//#region node_modules/.pnpm/@base-ui+utils@0.5.0_@types+react@18.3.31_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/utils/store/ReactStore.mjs
		/**
		* A Store that supports controlled state keys, non-reactive values and provides utility methods for React.
		*/
		var ReactStore = class extends Store {
			/**
			* Creates a new ReactStore instance.
			*
			* @param state Initial state of the store.
			* @param context Non-reactive context values.
			* @param selectors Optional selectors for use with `useState`.
			*/
			constructor(state, context = {}, selectors) {
				super(state);
				this.context = context;
				this.selectors = selectors;
			}
			/**
			* Non-reactive values such as refs, callbacks, etc.
			*/
			/**
			* Synchronizes a single external value into the store.
			*
			* Note that the while the value in `state` is updated immediately, the value returned
			* by `useState` is updated before the next render (similarly to React's `useState`).
			*/
			useSyncedValue(key, value) {
				react.useDebugValue(key);
				const store = this;
				useIsoLayoutEffect(() => {
					if (store.state[key] !== value) store.set(key, value);
				}, [
					store,
					key,
					value
				]);
			}
			/**
			* Synchronizes a single external value into the store and
			* cleans it up (sets to `undefined`) on unmount.
			*
			* Note that the while the value in `state` is updated immediately, the value returned
			* by `useState` is updated before the next render (similarly to React's `useState`).
			*/
			useSyncedValueWithCleanup(key, value) {
				const store = this;
				useIsoLayoutEffect(() => {
					if (store.state[key] !== value) store.set(key, value);
					return () => {
						store.set(key, void 0);
					};
				}, [
					store,
					key,
					value
				]);
			}
			/**
			* Synchronizes multiple external values into the store.
			* Each value must match its state key. Pass an exact known subset rather than a broad
			* `Partial<State>`, which may contain `undefined` for required state fields.
			*
			* Note that the while the values in `state` are updated immediately, the values returned
			* by `useState` are updated before the next render (similarly to React's `useState`).
			*
			* @param statePart An exact subset of state fields to synchronize. Unknown keys are not accepted.
			*/
			useSyncedValues(statePart) {
				const store = this;
				const dependencies = Object.values(statePart);
				useIsoLayoutEffect(() => {
					store.update(statePart);
				}, [store, ...dependencies]);
			}
			/**
			* Registers a controllable prop pair (`controlled`, `defaultValue`) for a specific key. If `controlled`
			* is non-undefined, the store's state at `key` is updated to match `controlled`.
			*/
			useControlledProp(key, controlled) {
				react.useDebugValue(key);
				const store = this;
				const isControlled = controlled !== void 0;
				useIsoLayoutEffect(() => {
					if (isControlled && !Object.is(store.state[key], controlled)) store.setState({
						...store.state,
						[key]: controlled
					});
				}, [
					store,
					key,
					controlled,
					isControlled
				]);
			}
			/** Gets the current value from the store using a selector with the provided key.
			*
			* @param key Key of the selector to use.
			*/
			select(key, a1, a2, a3) {
				const selector = this.selectors[key];
				return selector(this.state, a1, a2, a3);
			}
			/**
			* Returns a value from the store's state using a selector function.
			* Used to subscribe to specific parts of the state.
			* This methods causes a rerender whenever the selected state changes.
			*
			* @param key Key of the selector to use.
			*/
			useState(key, a1, a2, a3) {
				react.useDebugValue(key);
				return useStore(this, this.selectors[key], a1, a2, a3);
			}
			/**
			* Wraps a function with `useStableCallback` to ensure it has a stable reference
			* and assigns it to the context.
			*
			* @param key Key of the event callback. Must be a function in the context.
			* @param fn Function to assign.
			*/
			useContextCallback(key, fn) {
				react.useDebugValue(key);
				const stableFunction = useStableCallback(fn ?? NOOP);
				this.context[key] = stableFunction;
			}
			/**
			* Returns a stable setter function for a specific key in the store's state.
			* It's commonly used to pass as a ref callback to React elements.
			*
			* @param key Key of the state to set.
			*/
			useStateSetter(key) {
				const ref = react.useRef(void 0);
				if (ref.current === void 0) ref.current = (value) => {
					this.set(key, value);
				};
				return ref.current;
			}
			/**
			* Observes changes derived from the store's selectors and calls the listener when the selected value changes.
			*
			* @param key Key of the selector to observe.
			* @param listener Listener function called when the selector result changes.
			*/
			observe(selector, listener) {
				let selectFn;
				if (typeof selector === "function") selectFn = selector;
				else selectFn = this.selectors[selector];
				let prevValue = selectFn(this.state);
				listener(prevValue, prevValue, this);
				return this.subscribe((nextState) => {
					const nextValue = selectFn(nextState);
					if (!Object.is(prevValue, nextValue)) {
						const oldValue = prevValue;
						prevValue = nextValue;
						listener(nextValue, oldValue, this);
					}
				});
			}
		};
		//#endregion
		//#region node_modules/.pnpm/@base-ui+react@1.9.0_@date-fns+tz@1.5.0_@types+react@18.3.31_date-fns@4.4.0_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/react/floating-ui-react/components/FloatingRootStore.mjs
		const selectors$2 = {
			open: (state) => state.open,
			transitionStatus: (state) => state.transitionStatus,
			domReferenceElement: (state) => state.domReferenceElement,
			referenceElement: (state) => state.positionReference ?? state.referenceElement,
			floatingElement: (state) => state.floatingElement,
			floatingId: (state) => state.floatingId
		};
		var FloatingRootStore = class extends ReactStore {
			constructor(options) {
				const { syncOnly, nested, onOpenChange, triggerElements, ...initialState } = options;
				super({
					...initialState,
					positionReference: initialState.referenceElement,
					domReferenceElement: initialState.referenceElement
				}, {
					onOpenChange,
					dataRef: { current: {} },
					events: createEventEmitter(),
					nested,
					triggerElements
				}, selectors$2);
				this.syncOnly = syncOnly;
			}
			/**
			* Syncs the event used by hover logic to distinguish hover-open from click-like interaction.
			*/
			syncOpenEvent = (newOpen, event) => {
				if (!newOpen || !this.state.open || event != null && isClickLikeEvent(event)) this.context.dataRef.current.openEvent = newOpen ? event : void 0;
			};
			/**
			* Runs the root-owned side effects for an open state change.
			*/
			dispatchOpenChange = (newOpen, eventDetails) => {
				this.syncOpenEvent(newOpen, eventDetails.event);
				const details = {
					open: newOpen,
					reason: eventDetails.reason,
					nativeEvent: eventDetails.event,
					nested: this.context.nested,
					triggerElement: eventDetails.trigger
				};
				this.context.events.emit("openchange", details);
			};
			/**
			* Emits the `openchange` event through the internal event emitter and calls the `onOpenChange` handler with the provided arguments.
			*
			* @param newOpen The new open state.
			* @param eventDetails Details about the event that triggered the open state change.
			*/
			setOpen = (newOpen, eventDetails) => {
				if (this.syncOnly) {
					this.context.onOpenChange?.(newOpen, eventDetails);
					return;
				}
				this.dispatchOpenChange(newOpen, eventDetails);
				this.context.onOpenChange?.(newOpen, eventDetails);
			};
		};
		//#endregion
		//#region node_modules/.pnpm/@base-ui+react@1.9.0_@date-fns+tz@1.5.0_@types+react@18.3.31_date-fns@4.4.0_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/react/utils/popups/store.mjs
		/**
		* State common to all popup stores.
		*/
		function createInitialPopupStoreState(triggerElements, floatingId, nested = false) {
			return {
				open: false,
				openProp: void 0,
				mounted: false,
				transitionStatus: void 0,
				floatingRootContext: new FloatingRootStore({
					open: false,
					transitionStatus: void 0,
					floatingElement: null,
					referenceElement: null,
					triggerElements,
					floatingId,
					syncOnly: true,
					nested,
					onOpenChange: void 0
				}),
				floatingId,
				triggerCount: 0,
				preventUnmountingOnClose: false,
				payload: void 0,
				activeTriggerId: null,
				activeTriggerElement: null,
				openedWithoutTrigger: false,
				triggerIdProp: void 0,
				popupElement: null,
				positionerElement: null,
				activeTriggerProps: EMPTY_OBJECT,
				inactiveTriggerProps: EMPTY_OBJECT,
				popupProps: EMPTY_OBJECT
			};
		}
		const activeTriggerIdSelector = (state) => state.triggerIdProp ?? state.activeTriggerId;
		const openSelector = (state) => state.openProp ?? state.open;
		const popupIdSelector = (state) => {
			return (state.popupElement?.id ?? state.floatingId) || void 0;
		};
		function triggerOwnsOpenPopup(state, triggerId) {
			return triggerId !== void 0 && openSelector(state) && activeTriggerIdSelector(state) === triggerId;
		}
		function triggerOwnsOpenPopupOrIsOnlyTrigger(state, triggerId) {
			if (triggerOwnsOpenPopup(state, triggerId)) return true;
			return triggerId !== void 0 && openSelector(state) && activeTriggerIdSelector(state) == null && !state.openedWithoutTrigger && state.triggerCount === 1;
		}
		const popupStoreSelectors = {
			open: openSelector,
			mounted: (state) => state.mounted,
			transitionStatus: (state) => openSelector(state) && !state.mounted ? "starting" : state.transitionStatus,
			floatingRootContext: (state) => state.floatingRootContext,
			triggerCount: (state) => state.triggerCount,
			preventUnmountingOnClose: (state) => state.preventUnmountingOnClose,
			payload: (state) => state.payload,
			activeTriggerId: activeTriggerIdSelector,
			activeTriggerElement: (state) => state.mounted ? state.activeTriggerElement : null,
			popupId: popupIdSelector,
			/**
			* Whether the trigger with the given ID was used to open the popup.
			*/
			isTriggerActive: (state, triggerId) => triggerId !== void 0 && activeTriggerIdSelector(state) === triggerId,
			/**
			* Whether the popup is open and was activated by a trigger with the given ID.
			*/
			isOpenedByTrigger: (state, triggerId) => triggerOwnsOpenPopup(state, triggerId),
			/**
			* Whether the popup is mounted and was activated by a trigger with the given ID.
			*/
			isMountedByTrigger: (state, triggerId) => triggerId !== void 0 && activeTriggerIdSelector(state) === triggerId && state.mounted,
			triggerProps: (state, isActive) => isActive ? state.activeTriggerProps : state.inactiveTriggerProps,
			/**
			* Popup id for the trigger that currently owns the open popup.
			*/
			triggerPopupId: (state, triggerId) => triggerOwnsOpenPopupOrIsOnlyTrigger(state, triggerId) ? popupIdSelector(state) : void 0,
			popupProps: (state) => state.popupProps,
			popupElement: (state) => state.popupElement,
			positionerElement: (state) => state.positionerElement
		};
		/**
		* Store members a detached handle-backed trigger reads or invokes for trigger registration and data
		* forwarding. `set`/`update` are included only for trigger-count and trigger-data bookkeeping; on a
		* detached (inert) store they are intentionally no-ops, so a write through them is not guaranteed to
		* be durable. Component handle-store views Pick these from their concrete store (preserving its
		* context and selectors) and add any component-specific trigger-invoked members such as `setOpen`.
		*/
		/**
		* The subset of a popup store that trigger registration and data forwarding rely on. Narrow enough
		* that an inert store can be passed while detached.
		*/
		//#endregion
		//#region node_modules/.pnpm/@base-ui+react@1.9.0_@date-fns+tz@1.5.0_@types+react@18.3.31_date-fns@4.4.0_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/react/utils/popups/usePopupHandleStore.mjs
		/**
		* Reads the store currently exposed by a popup handle and subscribes to store-pointer changes.
		* Detached triggers use this to follow a handle as a root attaches or detaches: while no root is
		* attached, the handle exposes its fallback store; once a root attaches, subscribers re-render and
		* read from the live root store.
		*
		* Returns `undefined` when no handle is provided so callers can fall back to their root context.
		*
		* @param handle The popup handle to read from, or `undefined` when the trigger is not handle-bound.
		*/
		function usePopupHandleStore(handle) {
			const subscribe = react.useCallback((listener) => {
				if (handle === void 0) return NOOP;
				return handle.subscribeStore(listener);
			}, [handle]);
			const getSnapshot = react.useCallback(() => {
				return handle === void 0 ? void 0 : handle.store;
			}, [handle]);
			return (0, import_shim.useSyncExternalStore)(subscribe, getSnapshot, () => handle?.serverStore);
		}
		//#endregion
		//#region node_modules/.pnpm/@base-ui+react@1.9.0_@date-fns+tz@1.5.0_@types+react@18.3.31_date-fns@4.4.0_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/react/floating-ui-react/hooks/useFocus.mjs
		const isMacSafari = mac && webkit;
		/**
		* Opens the floating element while the reference element has focus, like CSS
		* `:focus`.
		* @see https://floating-ui.com/docs/useFocus
		*/
		function useFocus(store, props = {}) {
			const { enabled = true, delay } = props;
			const { events, dataRef } = store.context;
			const blockFocusRef = react.useRef(false);
			const blockedReferenceRef = react.useRef(null);
			const keyboardModalityRef = react.useRef(true);
			const timeout = useTimeout();
			react.useEffect(() => {
				const domReference = store.select("domReferenceElement");
				if (!enabled) return;
				const win = getWindow(domReference);
				function onBlur() {
					const currentDomReference = store.select("domReferenceElement");
					if (!store.select("open") && isHTMLElement(currentDomReference) && currentDomReference === activeElement(ownerDocument(currentDomReference))) {
						blockFocusRef.current = true;
						blockedReferenceRef.current = currentDomReference;
					}
				}
				function onKeyDown() {
					keyboardModalityRef.current = true;
				}
				function onPointerDown() {
					keyboardModalityRef.current = false;
				}
				return mergeCleanups(addEventListener(win, "blur", onBlur), isMacSafari && addEventListener(win, "keydown", onKeyDown, true), isMacSafari && addEventListener(win, "pointerdown", onPointerDown, true));
			}, [store, enabled]);
			react.useEffect(() => {
				if (!enabled) return;
				function onOpenChangeLocal(details) {
					if (details.reason === "trigger-press" || details.reason === "escape-key") {
						const referenceElement = store.select("domReferenceElement");
						if (isElement(referenceElement)) {
							blockedReferenceRef.current = referenceElement;
							blockFocusRef.current = true;
						}
					}
				}
				events.on("openchange", onOpenChangeLocal);
				return () => {
					events.off("openchange", onOpenChangeLocal);
				};
			}, [
				events,
				enabled,
				store
			]);
			const reference = react.useMemo(() => {
				function resetBlockedFocus() {
					blockFocusRef.current = false;
					blockedReferenceRef.current = null;
				}
				return {
					onMouseLeave() {
						resetBlockedFocus();
					},
					onFocus(event) {
						const focusTarget = event.currentTarget;
						if (blockFocusRef.current) {
							if (blockedReferenceRef.current === focusTarget) return;
							resetBlockedFocus();
						}
						const target = getTarget(event.nativeEvent);
						if (isElement(target)) {
							if (isMacSafari && !event.relatedTarget) {
								if (!keyboardModalityRef.current && !isTypeableElement(target)) return;
							} else if (!matchesFocusVisible(target)) return;
						}
						const movedFromOtherEnabledTrigger = isTargetInsideEnabledTrigger(event.relatedTarget, store.context.triggerElements);
						const { nativeEvent, currentTarget } = event;
						if (store.select("open") && movedFromOtherEnabledTrigger || !delay) {
							store.setOpen(true, createChangeEventDetails(triggerFocus, nativeEvent, currentTarget));
							return;
						}
						timeout.start(delay, () => {
							if (blockFocusRef.current) return;
							store.setOpen(true, createChangeEventDetails(triggerFocus, nativeEvent, currentTarget));
						});
					},
					onBlur(event) {
						resetBlockedFocus();
						const relatedTarget = event.relatedTarget;
						const nativeEvent = event.nativeEvent;
						const movedToFocusGuard = isElement(relatedTarget) && relatedTarget.hasAttribute(createAttribute("focus-guard")) && relatedTarget.getAttribute("data-type") === "outside";
						timeout.start(0, () => {
							const domReference = store.select("domReferenceElement");
							const activeEl = activeElement(ownerDocument(domReference));
							if (!relatedTarget && activeEl === domReference) return;
							if (contains(dataRef.current.floatingContext?.refs.floating.current, activeEl) || contains(domReference, activeEl) || movedToFocusGuard) return;
							if (isTargetInsideEnabledTrigger(relatedTarget ?? activeEl, store.context.triggerElements)) return;
							store.setOpen(false, createChangeEventDetails(triggerFocus, nativeEvent));
						});
					}
				};
			}, [
				dataRef,
				delay,
				store,
				timeout
			]);
			return react.useMemo(() => enabled ? {
				reference,
				trigger: reference
			} : {}, [enabled, reference]);
		}
		//#endregion
		//#region node_modules/.pnpm/@base-ui+react@1.9.0_@date-fns+tz@1.5.0_@types+react@18.3.31_date-fns@4.4.0_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/react/floating-ui-react/hooks/useHoverInteractionSharedState.mjs
		var HoverInteraction = class HoverInteraction {
			pointerType = void 0;
			interactedInside = false;
			handler = void 0;
			blockMouseMove = true;
			performedPointerEventsMutation = false;
			pointerEventsScopeElement = null;
			pointerEventsReferenceElement = null;
			pointerEventsFloatingElement = null;
			restTimeoutPending = false;
			openChangeTimeout = new Timeout();
			restTimeout = new Timeout();
			handleCloseOptions = void 0;
			static create() {
				return new HoverInteraction();
			}
			dispose = () => {
				this.openChangeTimeout.clear();
				this.restTimeout.clear();
			};
			disposeEffect = () => {
				return this.dispose;
			};
		};
		const pointerEventsMutationOwnerByScopeElement = /* @__PURE__ */ new WeakMap();
		function clearSafePolygonPointerEventsMutation(instance) {
			if (!instance.performedPointerEventsMutation) return;
			const scopeElement = instance.pointerEventsScopeElement;
			if (scopeElement && pointerEventsMutationOwnerByScopeElement.get(scopeElement) === instance) {
				instance.pointerEventsScopeElement?.style.removeProperty("pointer-events");
				instance.pointerEventsReferenceElement?.style.removeProperty("pointer-events");
				instance.pointerEventsFloatingElement?.style.removeProperty("pointer-events");
				pointerEventsMutationOwnerByScopeElement.delete(scopeElement);
			}
			instance.performedPointerEventsMutation = false;
			instance.pointerEventsScopeElement = null;
			instance.pointerEventsReferenceElement = null;
			instance.pointerEventsFloatingElement = null;
		}
		function applySafePolygonPointerEventsMutation(instance, options) {
			const { scopeElement, referenceElement, floatingElement } = options;
			const existingOwner = pointerEventsMutationOwnerByScopeElement.get(scopeElement);
			if (existingOwner && existingOwner !== instance) clearSafePolygonPointerEventsMutation(existingOwner);
			clearSafePolygonPointerEventsMutation(instance);
			instance.performedPointerEventsMutation = true;
			instance.pointerEventsScopeElement = scopeElement;
			instance.pointerEventsReferenceElement = referenceElement;
			instance.pointerEventsFloatingElement = floatingElement;
			pointerEventsMutationOwnerByScopeElement.set(scopeElement, instance);
			scopeElement.style.pointerEvents = "none";
			referenceElement.style.pointerEvents = "auto";
			floatingElement.style.pointerEvents = "auto";
		}
		function useHoverInteractionSharedState(store) {
			const data = store.context.dataRef.current;
			const instance = useRefWithInit(() => data.hoverInteractionState ?? HoverInteraction.create()).current;
			if (!data.hoverInteractionState) data.hoverInteractionState = instance;
			useOnMount(data.hoverInteractionState.disposeEffect);
			return data.hoverInteractionState;
		}
		//#endregion
		//#region node_modules/.pnpm/@base-ui+react@1.9.0_@date-fns+tz@1.5.0_@types+react@18.3.31_date-fns@4.4.0_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/react/floating-ui-react/hooks/useHoverFloatingInteraction.mjs
		/**
		* Provides hover interactions that should be attached to the floating element.
		*/
		function useHoverFloatingInteraction(store, parameters = {}) {
			const { enabled = true, closeDelay: closeDelayProp = 0, nodeId: nodeIdProp } = parameters;
			const open = store.useState("open");
			const floatingElement = store.useState("floatingElement");
			const domReferenceElement = store.useState("domReferenceElement");
			const { dataRef } = store.context;
			const tree = useFloatingTree();
			const parentId = useFloatingParentNodeId();
			const instance = useHoverInteractionSharedState(store);
			const childClosedTimeout = useTimeout();
			const isClickLikeOpenEvent$2 = useStableCallback(() => {
				return isClickLikeOpenEvent(dataRef.current.openEvent?.type, instance.interactedInside);
			});
			const isHoverOpen = useStableCallback(() => {
				return isHoverOpenEvent(dataRef.current.openEvent?.type);
			});
			const clearPointerEvents = useStableCallback(() => {
				clearSafePolygonPointerEventsMutation(instance);
			});
			useIsoLayoutEffect(() => {
				if (!open) {
					instance.pointerType = void 0;
					instance.restTimeoutPending = false;
					instance.interactedInside = false;
					clearPointerEvents();
				}
			}, [
				open,
				instance,
				clearPointerEvents
			]);
			react.useEffect(() => {
				return clearPointerEvents;
			}, [clearPointerEvents]);
			useIsoLayoutEffect(() => {
				if (!enabled) return;
				if (open && instance.handleCloseOptions?.blockPointerEvents && isHoverOpen() && isElement(domReferenceElement) && floatingElement) {
					const ref = domReferenceElement;
					const floatingEl = floatingElement;
					const doc = ownerDocument(floatingElement);
					const parentFloating = tree?.nodesRef.current.find((node) => node.id === parentId)?.context?.elements.floating;
					if (parentFloating) parentFloating.style.pointerEvents = "";
					const cachedScopeElement = instance.pointerEventsScopeElement !== floatingEl ? instance.pointerEventsScopeElement : null;
					const parentScopeElement = parentFloating !== floatingEl ? parentFloating : null;
					const scopeElement = instance.handleCloseOptions?.getScope?.() ?? cachedScopeElement ?? parentScopeElement ?? closest(ref, "[data-rootownerid]") ?? doc.body;
					applySafePolygonPointerEventsMutation(instance, {
						scopeElement,
						referenceElement: ref,
						floatingElement: floatingEl
					});
					return () => {
						clearPointerEvents();
					};
				}
			}, [
				enabled,
				open,
				domReferenceElement,
				floatingElement,
				instance,
				isHoverOpen,
				tree,
				parentId,
				clearPointerEvents
			]);
			react.useEffect(() => {
				if (!enabled) return;
				function hasParentChildren() {
					return !!(tree && parentId && getNodeChildren(tree.nodesRef.current, parentId).length > 0);
				}
				function closeWithDelay(event) {
					const closeDelay = getDelay(closeDelayProp, "close", instance.pointerType);
					const close = () => {
						store.setOpen(false, createChangeEventDetails(triggerHover, event));
						tree?.events.emit("floating.closed", event);
					};
					if (closeDelay) instance.openChangeTimeout.start(closeDelay, close);
					else {
						instance.openChangeTimeout.clear();
						close();
					}
				}
				function handleInteractInside(event) {
					const target = getTarget(event);
					if (!isInteractiveElement(target)) {
						instance.interactedInside = false;
						return;
					}
					instance.interactedInside = closest(target, "[aria-haspopup]") != null;
				}
				function onFloatingMouseEnter() {
					instance.openChangeTimeout.clear();
					childClosedTimeout.clear();
					tree?.events.off("floating.closed", onNodeClosed);
					clearPointerEvents();
				}
				function onFloatingMouseLeave(event) {
					if (hasParentChildren() && tree) {
						tree.events.on("floating.closed", onNodeClosed);
						return;
					}
					if (isTargetInsideEnabledTrigger(event.relatedTarget, store.context.triggerElements)) return;
					const currentNodeId = dataRef.current.floatingContext?.nodeId ?? nodeIdProp;
					const relatedTarget = event.relatedTarget;
					if (tree && currentNodeId && isElement(relatedTarget) && getNodeChildren(tree.nodesRef.current, currentNodeId, false).some((node) => contains(node.context?.elements.floating, relatedTarget))) return;
					if (instance.handler) {
						instance.handler(event);
						return;
					}
					clearPointerEvents();
					if (isHoverOpen() && !isClickLikeOpenEvent$2()) closeWithDelay(event);
				}
				function onNodeClosed(event) {
					if (!tree || !parentId || hasParentChildren()) return;
					childClosedTimeout.start(0, () => {
						tree.events.off("floating.closed", onNodeClosed);
						store.setOpen(false, createChangeEventDetails(triggerHover, event));
						tree.events.emit("floating.closed", event);
					});
				}
				const floating = floatingElement;
				return mergeCleanups(floating && addEventListener(floating, "mouseenter", onFloatingMouseEnter), floating && addEventListener(floating, "mouseleave", onFloatingMouseLeave), floating && addEventListener(floating, "pointerdown", handleInteractInside, true), () => {
					tree?.events.off("floating.closed", onNodeClosed);
				});
			}, [
				enabled,
				floatingElement,
				store,
				dataRef,
				closeDelayProp,
				nodeIdProp,
				isHoverOpen,
				isClickLikeOpenEvent$2,
				clearPointerEvents,
				instance,
				tree,
				parentId,
				childClosedTimeout
			]);
		}
		//#endregion
		//#region node_modules/.pnpm/@base-ui+react@1.9.0_@date-fns+tz@1.5.0_@types+react@18.3.31_date-fns@4.4.0_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/react/floating-ui-react/hooks/useHoverReferenceInteraction.mjs
		const EMPTY_REF = { current: null };
		/**
		* Provides hover interactions that should be attached to reference or trigger
		* elements.
		*/
		function useHoverReferenceInteraction(store, props = {}) {
			const { enabled = true, delay = 0, handleClose = null, mouseOnly = false, restMs = 0, move = true, triggerElementRef = EMPTY_REF, externalTree, isActiveTrigger = true, getHandleCloseContext, isClosing, shouldOpen: shouldOpenProp, guardStaleOpen = false } = props;
			const { dataRef, events } = store.context;
			const tree = useFloatingTree(externalTree);
			const instance = useHoverInteractionSharedState(store);
			const isHoverCloseActiveRef = react.useRef(false);
			const handleCloseRef = useValueAsRef(handleClose);
			const delayRef = useValueAsRef(delay);
			const restMsRef = useValueAsRef(restMs);
			const enabledRef = useValueAsRef(enabled);
			const shouldOpenRef = useValueAsRef(shouldOpenProp);
			const isClosingRef = useValueAsRef(isClosing);
			const isClickLikeOpenEvent$1 = useStableCallback(() => {
				return isClickLikeOpenEvent(dataRef.current.openEvent?.type, instance.interactedInside);
			});
			const checkShouldOpen = useStableCallback(() => {
				return shouldOpenRef.current?.() !== false;
			});
			const isOverInactiveTrigger = useStableCallback((currentDomReference, currentTarget, target) => {
				const allTriggers = store.context.triggerElements;
				if (allTriggers.hasElement(currentTarget)) return !currentDomReference || !contains(currentDomReference, currentTarget);
				if (!isElement(target)) return false;
				const targetElement = target;
				return allTriggers.hasMatchingElement((trigger) => contains(trigger, targetElement)) && (!currentDomReference || !contains(currentDomReference, targetElement));
			});
			const cleanupMouseMoveHandler = useStableCallback(() => {
				if (!instance.handler) return;
				ownerDocument(store.select("domReferenceElement")).removeEventListener("mousemove", instance.handler);
				instance.handler = void 0;
			});
			const clearPointerEvents = useStableCallback(() => {
				clearSafePolygonPointerEventsMutation(instance);
			});
			if (isActiveTrigger) instance.handleCloseOptions = handleClose?.__options;
			react.useEffect(() => cleanupMouseMoveHandler, [cleanupMouseMoveHandler]);
			react.useEffect(() => {
				if (!enabled) return;
				function onOpenChangeLocal(details) {
					if (!details.open) {
						isHoverCloseActiveRef.current = details.reason === triggerHover;
						cleanupMouseMoveHandler();
						instance.openChangeTimeout.clear();
						instance.restTimeout.clear();
						instance.blockMouseMove = true;
						instance.restTimeoutPending = false;
					} else isHoverCloseActiveRef.current = false;
				}
				events.on("openchange", onOpenChangeLocal);
				return () => {
					events.off("openchange", onOpenChangeLocal);
				};
			}, [
				enabled,
				events,
				instance,
				cleanupMouseMoveHandler
			]);
			react.useEffect(() => {
				if (!enabled) return;
				function closeWithDelay(event, runElseBranch = true) {
					const closeDelay = getDelay(delayRef.current, "close", instance.pointerType);
					if (closeDelay) instance.openChangeTimeout.start(closeDelay, () => {
						store.setOpen(false, createChangeEventDetails(triggerHover, event));
						tree?.events.emit("floating.closed", event);
					});
					else if (runElseBranch) {
						instance.openChangeTimeout.clear();
						store.setOpen(false, createChangeEventDetails(triggerHover, event));
						tree?.events.emit("floating.closed", event);
					}
				}
				const trigger = triggerElementRef.current ?? (isActiveTrigger ? store.select("domReferenceElement") : null);
				if (!isElement(trigger)) return;
				function onMouseEnter(event) {
					instance.openChangeTimeout.clear();
					instance.blockMouseMove = false;
					if (mouseOnly && !isMouseLikePointerType(instance.pointerType)) return;
					const restMsValue = getRestMs(restMsRef.current);
					const openDelay = getDelay(delayRef.current, "open", instance.pointerType);
					const eventTarget = getTarget(event);
					const currentTarget = event.currentTarget ?? null;
					const currentDomReference = store.select("domReferenceElement");
					let triggerNode = currentTarget;
					if (isElement(eventTarget) && !store.context.triggerElements.hasElement(eventTarget)) {
						for (const triggerElement of store.context.triggerElements.elements()) if (contains(triggerElement, eventTarget)) {
							triggerNode = triggerElement;
							break;
						}
					}
					if (isElement(currentTarget) && isElement(currentDomReference) && !store.context.triggerElements.hasElement(currentTarget) && contains(currentTarget, currentDomReference)) triggerNode = currentDomReference;
					const isOverInactive = triggerNode == null ? false : isOverInactiveTrigger(currentDomReference, triggerNode, eventTarget);
					const isOpen = store.select("open");
					const isInClosingTransition = isClosingRef.current?.() ?? store.select("transitionStatus") === "ending";
					const isHoverCloseTransition = !isOpen && isInClosingTransition && isHoverCloseActiveRef.current;
					const isReenteringSameTriggerDuringCloseTransition = !isOverInactive && isElement(triggerNode) && isElement(currentDomReference) && contains(currentDomReference, triggerNode) && isHoverCloseTransition;
					const isRestOnlyDelay = restMsValue > 0 && !openDelay;
					const shouldOpenImmediately = isOverInactive && (isOpen || isHoverCloseTransition) || isReenteringSameTriggerDuringCloseTransition;
					const shouldOpen = !isOpen || isOverInactive;
					if (shouldOpenImmediately) {
						if (checkShouldOpen()) store.setOpen(true, createChangeEventDetails(triggerHover, event, triggerNode));
						return;
					}
					if (isRestOnlyDelay) return;
					if (openDelay) instance.openChangeTimeout.start(openDelay, () => {
						if (shouldOpen && checkShouldOpen()) store.setOpen(true, createChangeEventDetails(triggerHover, event, triggerNode));
					});
					else if (shouldOpen) {
						if (checkShouldOpen()) store.setOpen(true, createChangeEventDetails(triggerHover, event, triggerNode));
					}
				}
				function onMouseLeave(event) {
					if (isClickLikeOpenEvent$1()) {
						clearPointerEvents();
						return;
					}
					cleanupMouseMoveHandler();
					const doc = ownerDocument(store.select("domReferenceElement"));
					instance.restTimeout.clear();
					instance.restTimeoutPending = false;
					const handleCloseContextBase = dataRef.current.floatingContext ?? getHandleCloseContext?.();
					if (isTargetInsideEnabledTrigger(event.relatedTarget, store.context.triggerElements)) return;
					if (handleCloseRef.current && handleCloseContextBase) {
						if (!store.select("open")) instance.openChangeTimeout.clear();
						const currentTrigger = triggerElementRef.current;
						instance.handler = handleCloseRef.current({
							...handleCloseContextBase,
							tree,
							x: event.clientX,
							y: event.clientY,
							onClose() {
								clearPointerEvents();
								cleanupMouseMoveHandler();
								if (enabledRef.current && !isClickLikeOpenEvent$1() && currentTrigger === store.select("domReferenceElement")) closeWithDelay(event, true);
							}
						});
						doc.addEventListener("mousemove", instance.handler);
						instance.handler(event);
						return;
					}
					if (instance.pointerType === "touch" ? !contains(store.select("floatingElement"), event.relatedTarget) : true) closeWithDelay(event);
				}
				function onMouseOut(event) {
					if (contains(trigger, event.relatedTarget)) return;
					instance.openChangeTimeout.clear();
					instance.restTimeout.clear();
					instance.restTimeoutPending = false;
				}
				const staleOpenGuard = guardStaleOpen ? addEventListener(trigger, "mouseout", onMouseOut) : void 0;
				if (move) return mergeCleanups(addEventListener(trigger, "mousemove", onMouseEnter, { once: true }), addEventListener(trigger, "mouseenter", onMouseEnter), addEventListener(trigger, "mouseleave", onMouseLeave), staleOpenGuard);
				return mergeCleanups(addEventListener(trigger, "mouseenter", onMouseEnter), addEventListener(trigger, "mouseleave", onMouseLeave), staleOpenGuard);
			}, [
				cleanupMouseMoveHandler,
				clearPointerEvents,
				dataRef,
				delayRef,
				store,
				enabled,
				handleCloseRef,
				instance,
				isActiveTrigger,
				isOverInactiveTrigger,
				isClickLikeOpenEvent$1,
				mouseOnly,
				move,
				restMsRef,
				triggerElementRef,
				tree,
				enabledRef,
				getHandleCloseContext,
				isClosingRef,
				checkShouldOpen,
				guardStaleOpen
			]);
			return react.useMemo(() => {
				if (!enabled) return;
				function setPointerRef(event) {
					instance.pointerType = event.pointerType;
				}
				return {
					onPointerDown: setPointerRef,
					onPointerEnter: setPointerRef,
					onMouseMove(event) {
						const { nativeEvent } = event;
						const trigger = event.currentTarget;
						const currentDomReference = store.select("domReferenceElement");
						const currentOpen = store.select("open");
						const isOverInactive = isOverInactiveTrigger(currentDomReference, trigger, event.target);
						if (mouseOnly && !isMouseLikePointerType(instance.pointerType)) return;
						if (currentOpen && isOverInactive && instance.handleCloseOptions?.blockPointerEvents) {
							const floatingElement = store.select("floatingElement");
							if (floatingElement) {
								const scopeElement = instance.handleCloseOptions?.getScope?.() ?? trigger.ownerDocument.body;
								applySafePolygonPointerEventsMutation(instance, {
									scopeElement,
									referenceElement: trigger,
									floatingElement
								});
							}
						}
						const restMsValue = getRestMs(restMsRef.current);
						if (currentOpen && !isOverInactive || restMsValue === 0) return;
						if (!isOverInactive && instance.restTimeoutPending && event.movementX ** 2 + event.movementY ** 2 < 2) return;
						instance.restTimeout.clear();
						function handleMouseMove() {
							instance.restTimeoutPending = false;
							if (isClickLikeOpenEvent$1()) return;
							const latestOpen = store.select("open");
							if (!instance.blockMouseMove && (!latestOpen || isOverInactive) && checkShouldOpen()) store.setOpen(true, createChangeEventDetails(triggerHover, nativeEvent, trigger));
						}
						if (instance.pointerType === "touch") react_dom.flushSync(() => {
							handleMouseMove();
						});
						else if (isOverInactive && currentOpen) handleMouseMove();
						else {
							instance.restTimeoutPending = true;
							instance.restTimeout.start(restMsValue, handleMouseMove);
						}
					}
				};
			}, [
				enabled,
				instance,
				isClickLikeOpenEvent$1,
				isOverInactiveTrigger,
				mouseOnly,
				store,
				restMsRef,
				checkShouldOpen
			]);
		}
		//#endregion
		//#region node_modules/.pnpm/@base-ui+react@1.9.0_@date-fns+tz@1.5.0_@types+react@18.3.31_date-fns@4.4.0_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/react/floating-ui-react/hooks/useListNavigation.mjs
		function isStationaryWebKitPointer(event) {
			return webkit && event.movementX === 0 && event.movementY === 0;
		}
		function doSwitch(orientation, vertical, horizontal) {
			switch (orientation) {
				case "vertical": return vertical;
				case "horizontal": return horizontal;
				default: return vertical || horizontal;
			}
		}
		function isMainOrientationKey(key, orientation) {
			return doSwitch(orientation, key === "ArrowUp" || key === "ArrowDown", key === "ArrowLeft" || key === "ArrowRight");
		}
		function isMainOrientationToEndKey(key, orientation, rtl) {
			return doSwitch(orientation, key === "ArrowDown", rtl ? key === "ArrowLeft" : key === "ArrowRight") || key === "Enter" || key === " " || key === "";
		}
		function isCrossOrientationOpenKey(key, orientation, rtl) {
			return doSwitch(orientation, rtl ? key === ARROW_LEFT$1 : key === ARROW_RIGHT$1, key === ARROW_DOWN$1);
		}
		function isCrossOrientationCloseKey(key, orientation, rtl, grid) {
			const vertical = rtl ? key === ARROW_RIGHT$1 : key === ARROW_LEFT$1;
			const horizontal = key === ARROW_UP$1;
			if (orientation === "both" || orientation === "horizontal" && grid) return key === "Escape";
			return doSwitch(orientation, vertical, horizontal);
		}
		/**
		* Adds arrow key-based navigation of a list of items, either using real DOM
		* focus or virtual focus.
		* @see https://floating-ui.com/docs/useListNavigation
		*/
		function useListNavigation(store, props) {
			const { listRef, activeIndex, onNavigate: onNavigateProp = () => {}, enabled = true, selectedIndex = null, allowEscape = false, loopFocus = false, nested = false, rtl = false, virtual = false, focusItemOnOpen = "auto", focusItemOnHover = true, openOnArrowKeyDown = true, disabledIndices = void 0, orientation = "vertical", triggerOrientation = orientation, parentOrientation, id, resetOnPointerLeave = true, externalTree, nestedReturnFocusRef, grid: navigateGrid } = props;
			const isGrid = navigateGrid != null;
			const open = store.useState("open");
			const floatingElement = store.useState("floatingElement");
			const domReferenceElement = store.useState("domReferenceElement");
			const dataRef = store.context.dataRef;
			const floatingFocusElement = getFloatingFocusElement(floatingElement);
			const typeableComboboxReference = isTypeableCombobox(domReferenceElement);
			const floatingFocusElementRef = useValueAsRef(floatingFocusElement);
			const parentId = useFloatingParentNodeId();
			const tree = useFloatingTree(externalTree);
			const focusItemOnOpenRef = react.useRef(focusItemOnOpen);
			const indexRef = react.useRef(selectedIndex ?? -1);
			const keyRef = react.useRef(null);
			const isPointerModalityRef = react.useRef(true);
			const onNavigate = useStableCallback((event) => {
				onNavigateProp(indexRef.current === -1 ? null : indexRef.current, event);
			});
			const previousMountedRef = react.useRef(!!floatingElement);
			const previousOpenRef = react.useRef(open);
			const forceSyncFocusRef = react.useRef(false);
			const forceScrollIntoViewRef = react.useRef(false);
			const cancelQueuedFocusRef = react.useRef(null);
			const disabledIndicesRef = useValueAsRef(disabledIndices);
			const latestOpenRef = useValueAsRef(open);
			const selectedIndexRef = useValueAsRef(selectedIndex);
			const resetOnPointerLeaveRef = useValueAsRef(resetOnPointerLeave);
			const focusFrame = useAnimationFrame();
			const waitForListPopulatedFrame = useAnimationFrame();
			const focusItem = useStableCallback(() => {
				focusFrame.cancel();
				function runFocus(item) {
					if (!virtual) cancelQueuedFocusRef.current = enqueueFocus(item, {
						sync: forceSyncFocusRef.current,
						preventScroll: true
					});
				}
				const initialItem = listRef.current[indexRef.current];
				const forceScrollIntoView = forceScrollIntoViewRef.current;
				if (initialItem) runFocus(initialItem);
				(forceSyncFocusRef.current ? (callback) => callback() : (callback) => focusFrame.request(callback))(() => {
					const waitedItem = listRef.current[indexRef.current] || initialItem;
					if (!waitedItem) return;
					if (!initialItem) runFocus(waitedItem);
					if (item && (forceScrollIntoView || !isPointerModalityRef.current)) waitedItem.scrollIntoView?.({
						block: "nearest",
						inline: "nearest"
					});
				});
			});
			useIsoLayoutEffect(() => {
				dataRef.current.orientation = orientation;
			}, [dataRef, orientation]);
			useIsoLayoutEffect(() => {
				if (!open) keyRef.current = null;
				if (!open || focusItemOnOpen !== "auto") focusItemOnOpenRef.current = focusItemOnOpen;
			}, [open, focusItemOnOpen]);
			useIsoLayoutEffect(() => {
				if (!enabled) return;
				if (open && floatingElement) {
					indexRef.current = selectedIndex ?? -1;
					if (focusItemOnOpenRef.current && selectedIndex != null) {
						forceScrollIntoViewRef.current = true;
						onNavigate();
					}
				} else if (previousMountedRef.current) {
					indexRef.current = -1;
					onNavigate();
				}
			}, [
				enabled,
				open,
				floatingElement,
				selectedIndex,
				onNavigate
			]);
			useIsoLayoutEffect(() => {
				if (!enabled) return;
				if (!open) {
					forceSyncFocusRef.current = false;
					return;
				}
				if (!floatingElement) return;
				if (activeIndex == null) {
					forceSyncFocusRef.current = false;
					if (selectedIndexRef.current != null) return;
					if (previousMountedRef.current) {
						indexRef.current = -1;
						focusItem();
					}
					if ((!previousOpenRef.current || !previousMountedRef.current) && focusItemOnOpenRef.current && (keyRef.current != null || focusItemOnOpenRef.current === true && keyRef.current == null)) {
						let runs = 0;
						const waitForListPopulated = () => {
							if (listRef.current[0] == null) {
								if (runs < 2) (runs ? (callback) => waitForListPopulatedFrame.request(callback) : queueMicrotask)(waitForListPopulated);
								runs += 1;
							} else {
								indexRef.current = keyRef.current == null || isMainOrientationToEndKey(keyRef.current, triggerOrientation, rtl) || nested ? getMinListIndex(listRef) : getMaxListIndex(listRef);
								keyRef.current = null;
								onNavigate();
							}
						};
						waitForListPopulated();
					}
				} else if (!isIndexOutOfListBounds(listRef.current, activeIndex)) {
					indexRef.current = activeIndex;
					focusItem();
					forceScrollIntoViewRef.current = false;
				}
			}, [
				enabled,
				open,
				floatingElement,
				activeIndex,
				selectedIndexRef,
				nested,
				listRef,
				triggerOrientation,
				rtl,
				onNavigate,
				focusItem,
				waitForListPopulatedFrame
			]);
			useIsoLayoutEffect(() => {
				if (!enabled || floatingElement || !tree || virtual || !previousMountedRef.current) return;
				const nodes = tree.nodesRef.current;
				const parent = nodes.find((node) => node.id === parentId)?.context?.elements.floating;
				const activeEl = activeElement(ownerDocument(domReferenceElement ?? parent ?? null));
				const treeContainsActiveEl = nodes.some((node) => node.context && contains(node.context.elements.floating, activeEl));
				if (parent && !treeContainsActiveEl && isPointerModalityRef.current) parent.focus({ preventScroll: true });
			}, [
				enabled,
				floatingElement,
				domReferenceElement,
				tree,
				parentId,
				virtual
			]);
			useIsoLayoutEffect(() => {
				previousOpenRef.current = open;
				previousMountedRef.current = !!floatingElement;
			});
			const hasActiveIndex = activeIndex != null;
			const syncCurrentTarget = useStableCallback((event) => {
				if (!latestOpenRef.current) return;
				const index = listRef.current.indexOf(event.currentTarget);
				if (index !== -1 && (indexRef.current !== index || activeIndex !== index)) {
					indexRef.current = index;
					onNavigate(event);
				}
			});
			const getParentOrientation = useStableCallback(() => {
				return parentOrientation ?? tree?.nodesRef.current.find((node) => node.id === parentId)?.context?.dataRef?.current.orientation;
			});
			const getMinEnabledIndex = useStableCallback(() => {
				return getMinListIndex(listRef, disabledIndicesRef.current);
			});
			const commonOnKeyDown = useStableCallback((event) => {
				isPointerModalityRef.current = false;
				forceSyncFocusRef.current = true;
				if (event.which === 229) return;
				if (!latestOpenRef.current && event.currentTarget === floatingFocusElementRef.current) return;
				if (nested && isCrossOrientationCloseKey(event.key, orientation, rtl, isGrid)) {
					if (!isMainOrientationKey(event.key, getParentOrientation())) stopEvent(event);
					store.setOpen(false, createChangeEventDetails(listNavigation, event.nativeEvent));
					const returnElement = nestedReturnFocusRef?.current ?? domReferenceElement;
					if (isHTMLElement(returnElement)) returnElement.focus();
					return;
				}
				if (activeIndex != null && activeIndex !== indexRef.current && !isIndexOutOfListBounds(listRef.current, activeIndex)) indexRef.current = activeIndex;
				const currentIndex = indexRef.current;
				const minIndex = getMinListIndex(listRef, disabledIndices);
				const maxIndex = getMaxListIndex(listRef, disabledIndices);
				if (!typeableComboboxReference) {
					if (event.key === "Home") {
						stopEvent(event);
						indexRef.current = minIndex;
						onNavigate(event);
					}
					if (event.key === "End") {
						stopEvent(event);
						indexRef.current = maxIndex;
						onNavigate(event);
					}
				}
				if (navigateGrid != null) {
					const index = navigateGrid(event, indexRef.current, listRef, orientation, loopFocus, rtl, disabledIndices, minIndex, maxIndex);
					if (index != null && index !== indexRef.current) {
						indexRef.current = index;
						onNavigate(event);
					}
					if (orientation === "both") return;
				}
				if (isMainOrientationKey(event.key, orientation)) {
					stopEvent(event);
					const focusedElement = activeElement(event.currentTarget.ownerDocument);
					if (open && !virtual && contains(event.currentTarget, focusedElement) && !listRef.current.some((item) => item != null && contains(item, focusedElement))) {
						indexRef.current = isMainOrientationToEndKey(event.key, orientation, rtl) ? minIndex : maxIndex;
						onNavigate(event);
						if (activeIndex === indexRef.current) focusItem();
						return;
					}
					const { index, wrapped } = getNextListIndex(listRef.current, currentIndex, {
						decrement: !isMainOrientationToEndKey(event.key, orientation, rtl),
						loopFocus,
						allowEscape,
						disabledIndices,
						minIndex,
						maxIndex
					});
					if (wrapped) forceSyncFocusRef.current = false;
					indexRef.current = index;
					onNavigate(event);
				}
			});
			const item = react.useMemo(() => {
				return {
					onFocus(event) {
						forceSyncFocusRef.current = true;
						syncCurrentTarget(event);
					},
					onClick({ currentTarget }) {
						if (!virtual) currentTarget.focus({ preventScroll: true });
					},
					onMouseMove(event) {
						if (isStationaryWebKitPointer(event)) return;
						forceSyncFocusRef.current = true;
						forceScrollIntoViewRef.current = false;
						if (focusItemOnHover) syncCurrentTarget(event);
					},
					onPointerLeave(event) {
						if (!latestOpenRef.current || !isPointerModalityRef.current || event.pointerType === "touch") return;
						forceSyncFocusRef.current = true;
						const relatedTarget = event.relatedTarget;
						if (!focusItemOnHover || listRef.current.includes(relatedTarget)) return;
						if (!resetOnPointerLeaveRef.current) return;
						cancelQueuedFocusRef.current?.();
						cancelQueuedFocusRef.current = null;
						indexRef.current = -1;
						onNavigate(event);
						if (!virtual) {
							const floatingFocusEl = floatingFocusElementRef.current;
							const activeEl = activeElement(ownerDocument(floatingFocusEl));
							if (floatingFocusEl && contains(floatingFocusEl, activeEl)) floatingFocusEl.focus({ preventScroll: true });
						}
					}
				};
			}, [
				syncCurrentTarget,
				latestOpenRef,
				floatingFocusElementRef,
				focusItemOnHover,
				listRef,
				onNavigate,
				resetOnPointerLeaveRef,
				virtual
			]);
			const ariaActiveDescendantProp = react.useMemo(() => {
				return virtual && open && hasActiveIndex && { "aria-activedescendant": `${id}-${activeIndex}` };
			}, [
				virtual,
				open,
				hasActiveIndex,
				id,
				activeIndex
			]);
			const floating = react.useMemo(() => {
				return {
					...!typeableComboboxReference ? ariaActiveDescendantProp : {},
					onKeyDown(event) {
						if (event.key === "Tab" && event.shiftKey && open && !virtual) {
							const target = getTarget(event.nativeEvent);
							if (target && !contains(floatingFocusElementRef.current, target)) return;
							stopEvent(event);
							const details = createChangeEventDetails(focusOut, event.nativeEvent);
							store.setOpen(false, details);
							const returnElement = nestedReturnFocusRef?.current ?? domReferenceElement;
							if (!details.isCanceled && isHTMLElement(returnElement)) returnElement.focus();
							return;
						}
						commonOnKeyDown(event);
					},
					onPointerMove(event) {
						if (isStationaryWebKitPointer(event)) return;
						isPointerModalityRef.current = true;
					}
				};
			}, [
				ariaActiveDescendantProp,
				commonOnKeyDown,
				floatingFocusElementRef,
				typeableComboboxReference,
				store,
				open,
				virtual,
				domReferenceElement,
				nestedReturnFocusRef
			]);
			const trigger = react.useMemo(() => {
				function openOnNavigationKeyDown(event) {
					store.setOpen(true, createChangeEventDetails(listNavigation, event.nativeEvent, event.currentTarget));
				}
				function checkVirtualMouse(event) {
					if (focusItemOnOpen === "auto" && isVirtualClick(event.nativeEvent)) focusItemOnOpenRef.current = !virtual;
				}
				function checkVirtualPointer(event) {
					focusItemOnOpenRef.current = focusItemOnOpen;
					if (focusItemOnOpen === "auto" && isVirtualPointerEvent(event.nativeEvent)) focusItemOnOpenRef.current = true;
				}
				return {
					onKeyDown(event) {
						const currentOpen = store.select("open");
						isPointerModalityRef.current = false;
						const isArrowKey = event.key.startsWith("Arrow");
						const isParentCrossOpenKey = isCrossOrientationOpenKey(event.key, getParentOrientation(), rtl);
						const isMainKey = isMainOrientationKey(event.key, currentOpen ? orientation : triggerOrientation);
						const isNavigationKey = (nested ? isParentCrossOpenKey : isMainKey) || event.key === "Enter" || event.key.trim() === "";
						if (virtual && currentOpen && (!nested || isTypeableElement(event.currentTarget))) return commonOnKeyDown(event);
						if (!currentOpen && !openOnArrowKeyDown && isArrowKey) return;
						if (isNavigationKey) {
							const isParentMainKey = isMainOrientationKey(event.key, getParentOrientation());
							keyRef.current = nested && isParentMainKey ? null : event.key;
						}
						if (nested) {
							if (isParentCrossOpenKey) {
								stopEvent(event);
								if (currentOpen) {
									indexRef.current = getMinEnabledIndex();
									onNavigate(event);
									if (virtual) floatingFocusElementRef.current?.focus();
								} else openOnNavigationKeyDown(event);
							}
							return;
						}
						if (isMainKey) {
							if (selectedIndexRef.current != null) indexRef.current = selectedIndexRef.current;
							stopEvent(event);
							if (!currentOpen && openOnArrowKeyDown) openOnNavigationKeyDown(event);
							else commonOnKeyDown(event);
							if (currentOpen) onNavigate(event);
						}
					},
					onFocus(event) {
						if (event.target !== event.currentTarget) return;
						if (store.select("open") && !virtual) {
							indexRef.current = -1;
							onNavigate(event);
						}
					},
					onPointerDown: checkVirtualPointer,
					onPointerEnter: checkVirtualPointer,
					onMouseDown: checkVirtualMouse,
					onClick: checkVirtualMouse
				};
			}, [
				commonOnKeyDown,
				focusItemOnOpen,
				getMinEnabledIndex,
				nested,
				onNavigate,
				store,
				openOnArrowKeyDown,
				orientation,
				triggerOrientation,
				getParentOrientation,
				rtl,
				selectedIndexRef,
				virtual,
				floatingFocusElementRef
			]);
			const reference = react.useMemo(() => {
				return {
					...ariaActiveDescendantProp,
					...trigger
				};
			}, [ariaActiveDescendantProp, trigger]);
			return react.useMemo(() => enabled ? {
				reference,
				floating,
				item,
				trigger
			} : {}, [
				enabled,
				reference,
				floating,
				trigger,
				item
			]);
		}
		//#endregion
		//#region node_modules/.pnpm/@base-ui+react@1.9.0_@date-fns+tz@1.5.0_@types+react@18.3.31_date-fns@4.4.0_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/react/floating-ui-react/hooks/useTypeahead.mjs
		/**
		* Provides a matching callback that can be used to focus an item as the user
		* types, often used in tandem with `useListNavigation()`.
		* @see https://floating-ui.com/docs/useTypeahead
		*/
		function useTypeahead(store, props) {
			const { listRef, elementsRef, activeIndex, onMatch: onMatchProp, disabledIndices, onTyping: onTypingProp, enabled = true, resetMs = 750, selectedIndex = null } = props;
			const onTyping = useStableCallback(onTypingProp);
			const open = store.useState("open");
			const timeout = useTimeout();
			const stringRef = react.useRef("");
			const prevIndexRef = react.useRef(selectedIndex ?? activeIndex ?? -1);
			const matchIndexRef = react.useRef(null);
			const onKeyDown = useStableCallback((event) => {
				function getElement(index) {
					return elementsRef?.current[index];
				}
				function isItemAvailable(index) {
					const element = getElement(index);
					if (element && !isElementVisible(element) || element?.matches(":disabled")) return false;
					return disabledIndices == null || !isListIndexDisabled(EMPTY_ARRAY, index, disabledIndices);
				}
				function getMatchingIndex(list, string, startIndex = 0) {
					if (list.length === 0) return -1;
					const normalizedStartIndex = (startIndex % list.length + list.length) % list.length;
					const lowerString = string.toLowerCase();
					for (let offset = 0; offset < list.length; offset += 1) {
						const index = (normalizedStartIndex + offset) % list.length;
						if (!list[index]?.toLowerCase().startsWith(lowerString) || !isItemAvailable(index)) continue;
						return index;
					}
					return -1;
				}
				const listContent = listRef.current;
				if (stringRef.current.length > 0 && event.key === " ") {
					stopEvent(event);
					onTyping?.(true);
				}
				if (stringRef.current.length > 0 && stringRef.current[0] !== " ") {
					if (getMatchingIndex(listContent, stringRef.current) === -1 && event.key !== " ") onTyping?.(false);
				}
				if (listContent == null || event.key.length !== 1 || event.ctrlKey || event.metaKey || event.altKey) return;
				if (open && event.key !== " ") {
					stopEvent(event);
					onTyping?.(true);
				}
				const isNewSession = stringRef.current === "";
				if (isNewSession) prevIndexRef.current = selectedIndex ?? activeIndex ?? -1;
				if (listContent.every((text, index) => text && isItemAvailable(index) ? text[0]?.toLowerCase() !== text[1]?.toLowerCase() : true) && stringRef.current === event.key) {
					stringRef.current = "";
					prevIndexRef.current = matchIndexRef.current;
				}
				stringRef.current += event.key;
				timeout.start(resetMs, () => {
					stringRef.current = "";
					prevIndexRef.current = matchIndexRef.current;
					onTyping?.(false);
				});
				const startIndex = ((isNewSession ? selectedIndex ?? activeIndex ?? -1 : prevIndexRef.current) ?? 0) + 1;
				const index = getMatchingIndex(listContent, stringRef.current, startIndex);
				if (index !== -1) {
					onMatchProp?.(index, event);
					matchIndexRef.current = index;
				} else if (event.key !== " ") {
					stringRef.current = "";
					onTyping?.(false);
				}
			});
			const onBlur = useStableCallback((event) => {
				const next = event.relatedTarget;
				const currentDomReferenceElement = store.select("domReferenceElement");
				const currentFloatingElement = store.select("floatingElement");
				if (contains(currentDomReferenceElement, next) || contains(currentFloatingElement, next)) return;
				timeout.clear();
				stringRef.current = "";
				prevIndexRef.current = matchIndexRef.current;
				onTyping?.(false);
			});
			useIsoLayoutEffect(() => {
				if (!open && selectedIndex !== null) return;
				timeout.clear();
				matchIndexRef.current = null;
				if (stringRef.current !== "") {
					stringRef.current = "";
					onTyping?.(false);
				}
			}, [
				open,
				selectedIndex,
				timeout,
				onTyping
			]);
			const sharedProps = react.useMemo(() => ({
				onKeyDown,
				onBlur
			}), [onKeyDown, onBlur]);
			return react.useMemo(() => enabled ? {
				reference: sharedProps,
				floating: sharedProps
			} : {}, [enabled, sharedProps]);
		}
		//#endregion
		//#region node_modules/.pnpm/@base-ui+react@1.9.0_@date-fns+tz@1.5.0_@types+react@18.3.31_date-fns@4.4.0_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/react/floating-ui-react/safePolygon.mjs
		const CURSOR_SPEED_THRESHOLD = .1;
		const CURSOR_SPEED_THRESHOLD_SQUARED = CURSOR_SPEED_THRESHOLD * CURSOR_SPEED_THRESHOLD;
		const POLYGON_BUFFER = .5;
		function hasIntersectingEdge(pointX, pointY, xi, yi, xj, yj) {
			return yi >= pointY !== yj >= pointY && pointX <= (xj - xi) * (pointY - yi) / (yj - yi) + xi;
		}
		function isPointInQuadrilateral(pointX, pointY, x1, y1, x2, y2, x3, y3, x4, y4) {
			let isInsideValue = false;
			if (hasIntersectingEdge(pointX, pointY, x1, y1, x2, y2)) isInsideValue = !isInsideValue;
			if (hasIntersectingEdge(pointX, pointY, x2, y2, x3, y3)) isInsideValue = !isInsideValue;
			if (hasIntersectingEdge(pointX, pointY, x3, y3, x4, y4)) isInsideValue = !isInsideValue;
			if (hasIntersectingEdge(pointX, pointY, x4, y4, x1, y1)) isInsideValue = !isInsideValue;
			return isInsideValue;
		}
		function isInsideRect(pointX, pointY, rect) {
			return pointX >= rect.x && pointX <= rect.x + rect.width && pointY >= rect.y && pointY <= rect.y + rect.height;
		}
		function isInsideAxisAlignedRect(pointX, pointY, x1, y1, x2, y2) {
			return pointX >= Math.min(x1, x2) && pointX <= Math.max(x1, x2) && pointY >= Math.min(y1, y2) && pointY <= Math.max(y1, y2);
		}
		/**
		* Generates a safe polygon area that the user can traverse without closing the
		* floating element once leaving the reference element.
		* @see https://floating-ui.com/docs/useHover#safepolygon
		*/
		function safePolygon(options = {}) {
			const { blockPointerEvents = false } = options;
			const timeout = new Timeout();
			const fn = ({ x, y, placement, elements, onClose, nodeId, tree }) => {
				const side = placement?.split("-")[0];
				let hasLanded = false;
				let lastX = null;
				let lastY = null;
				let lastCursorTime = typeof performance !== "undefined" ? performance.now() : 0;
				function isCursorMovingSlowly(nextX, nextY) {
					const currentTime = performance.now();
					const elapsedTime = currentTime - lastCursorTime;
					if (lastX === null || lastY === null || elapsedTime === 0) {
						lastX = nextX;
						lastY = nextY;
						lastCursorTime = currentTime;
						return false;
					}
					const deltaX = nextX - lastX;
					const deltaY = nextY - lastY;
					const distanceSquared = deltaX * deltaX + deltaY * deltaY;
					const thresholdSquared = elapsedTime * elapsedTime * CURSOR_SPEED_THRESHOLD_SQUARED;
					lastX = nextX;
					lastY = nextY;
					lastCursorTime = currentTime;
					return distanceSquared < thresholdSquared;
				}
				function close() {
					timeout.clear();
					onClose();
				}
				return function onMouseMove(event) {
					timeout.clear();
					const domReference = elements.domReference;
					const floating = elements.floating;
					if (!domReference || !floating || side == null || x == null || y == null) return;
					const { clientX, clientY } = event;
					const target = getTarget(event);
					const isLeave = event.type === "mouseleave";
					const isOverFloatingEl = contains(floating, target);
					const isOverReferenceEl = contains(domReference, target);
					if (isOverFloatingEl) {
						hasLanded = true;
						if (!isLeave) return;
					}
					if (isOverReferenceEl) {
						hasLanded = false;
						if (!isLeave) {
							hasLanded = true;
							return;
						}
					}
					if (isLeave && isElement(event.relatedTarget) && contains(floating, event.relatedTarget)) return;
					function hasOpenChildNode() {
						return Boolean(tree && getNodeChildren(tree.nodesRef.current, nodeId).length > 0);
					}
					function closeIfNoOpenChild() {
						if (!hasOpenChildNode()) close();
					}
					if (hasOpenChildNode()) return;
					const refRect = domReference.getBoundingClientRect();
					const rect = floating.getBoundingClientRect();
					const cursorLeaveFromRight = x > rect.right - rect.width / 2;
					const cursorLeaveFromBottom = y > rect.bottom - rect.height / 2;
					const isFloatingWider = rect.width > refRect.width;
					const isFloatingTaller = rect.height > refRect.height;
					const left = (isFloatingWider ? refRect : rect).left;
					const right = (isFloatingWider ? refRect : rect).right;
					const top = (isFloatingTaller ? refRect : rect).top;
					const bottom = (isFloatingTaller ? refRect : rect).bottom;
					if (side === "top" && y >= refRect.bottom - 1 || side === "bottom" && y <= refRect.top + 1 || side === "left" && x >= refRect.right - 1 || side === "right" && x <= refRect.left + 1) {
						closeIfNoOpenChild();
						return;
					}
					let isInsideTroughRect = false;
					switch (side) {
						case "top":
							isInsideTroughRect = isInsideAxisAlignedRect(clientX, clientY, left, refRect.top + 1, right, rect.bottom - 1);
							break;
						case "bottom":
							isInsideTroughRect = isInsideAxisAlignedRect(clientX, clientY, left, rect.top + 1, right, refRect.bottom - 1);
							break;
						case "left":
							isInsideTroughRect = isInsideAxisAlignedRect(clientX, clientY, rect.right - 1, bottom, refRect.left + 1, top);
							break;
						case "right": isInsideTroughRect = isInsideAxisAlignedRect(clientX, clientY, refRect.right - 1, bottom, rect.left + 1, top);
					}
					if (isInsideTroughRect) return;
					if (hasLanded && !isInsideRect(clientX, clientY, refRect)) {
						closeIfNoOpenChild();
						return;
					}
					if (!isLeave && isCursorMovingSlowly(clientX, clientY)) {
						closeIfNoOpenChild();
						return;
					}
					let isInsidePolygon = false;
					switch (side) {
						case "top": {
							const cursorXOffset = isFloatingWider ? POLYGON_BUFFER / 2 : POLYGON_BUFFER * 4;
							const cursorPointOneX = isFloatingWider ? x + cursorXOffset : cursorLeaveFromRight ? x + cursorXOffset : x - cursorXOffset;
							const cursorPointTwoX = isFloatingWider ? x - cursorXOffset : cursorLeaveFromRight ? x + cursorXOffset : x - cursorXOffset;
							const cursorPointY = y + POLYGON_BUFFER + 1;
							const commonYLeft = cursorLeaveFromRight ? rect.bottom - POLYGON_BUFFER : isFloatingWider ? rect.bottom - POLYGON_BUFFER : rect.top;
							const commonYRight = cursorLeaveFromRight ? isFloatingWider ? rect.bottom - POLYGON_BUFFER : rect.top : rect.bottom - POLYGON_BUFFER;
							isInsidePolygon = isPointInQuadrilateral(clientX, clientY, cursorPointOneX, cursorPointY, cursorPointTwoX, cursorPointY, rect.left, commonYLeft, rect.right, commonYRight);
							break;
						}
						case "bottom": {
							const cursorXOffset = isFloatingWider ? POLYGON_BUFFER / 2 : POLYGON_BUFFER * 4;
							const cursorPointOneX = isFloatingWider ? x + cursorXOffset : cursorLeaveFromRight ? x + cursorXOffset : x - cursorXOffset;
							const cursorPointTwoX = isFloatingWider ? x - cursorXOffset : cursorLeaveFromRight ? x + cursorXOffset : x - cursorXOffset;
							const cursorPointY = y - POLYGON_BUFFER;
							const commonYLeft = cursorLeaveFromRight ? rect.top + POLYGON_BUFFER : isFloatingWider ? rect.top + POLYGON_BUFFER : rect.bottom;
							const commonYRight = cursorLeaveFromRight ? isFloatingWider ? rect.top + POLYGON_BUFFER : rect.bottom : rect.top + POLYGON_BUFFER;
							isInsidePolygon = isPointInQuadrilateral(clientX, clientY, cursorPointOneX, cursorPointY, cursorPointTwoX, cursorPointY, rect.left, commonYLeft, rect.right, commonYRight);
							break;
						}
						case "left": {
							const cursorYOffset = isFloatingTaller ? POLYGON_BUFFER / 2 : POLYGON_BUFFER * 4;
							const cursorPointOneY = isFloatingTaller ? y + cursorYOffset : cursorLeaveFromBottom ? y + cursorYOffset : y - cursorYOffset;
							const cursorPointTwoY = isFloatingTaller ? y - cursorYOffset : cursorLeaveFromBottom ? y + cursorYOffset : y - cursorYOffset;
							const cursorPointX = x + POLYGON_BUFFER + 1;
							const commonXTop = cursorLeaveFromBottom ? rect.right - POLYGON_BUFFER : isFloatingTaller ? rect.right - POLYGON_BUFFER : rect.left;
							const commonXBottom = cursorLeaveFromBottom ? isFloatingTaller ? rect.right - POLYGON_BUFFER : rect.left : rect.right - POLYGON_BUFFER;
							isInsidePolygon = isPointInQuadrilateral(clientX, clientY, commonXTop, rect.top, commonXBottom, rect.bottom, cursorPointX, cursorPointOneY, cursorPointX, cursorPointTwoY);
							break;
						}
						case "right": {
							const cursorYOffset = isFloatingTaller ? POLYGON_BUFFER / 2 : POLYGON_BUFFER * 4;
							const cursorPointOneY = isFloatingTaller ? y + cursorYOffset : cursorLeaveFromBottom ? y + cursorYOffset : y - cursorYOffset;
							const cursorPointTwoY = isFloatingTaller ? y - cursorYOffset : cursorLeaveFromBottom ? y + cursorYOffset : y - cursorYOffset;
							const cursorPointX = x - POLYGON_BUFFER;
							const commonXTop = cursorLeaveFromBottom ? rect.left + POLYGON_BUFFER : isFloatingTaller ? rect.left + POLYGON_BUFFER : rect.right;
							const commonXBottom = cursorLeaveFromBottom ? isFloatingTaller ? rect.left + POLYGON_BUFFER : rect.right : rect.left + POLYGON_BUFFER;
							isInsidePolygon = isPointInQuadrilateral(clientX, clientY, cursorPointX, cursorPointOneY, cursorPointX, cursorPointTwoY, commonXTop, rect.top, commonXBottom, rect.bottom);
							break;
						}
					}
					if (!isInsidePolygon) closeIfNoOpenChild();
					else if (!hasLanded) timeout.start(40, closeIfNoOpenChild);
				};
			};
			fn.__options = {
				...options,
				blockPointerEvents
			};
			return fn;
		}
		//#endregion
		//#region node_modules/.pnpm/@floating-ui+core@1.8.0/node_modules/@floating-ui/core/dist/floating-ui.core.mjs
		function computeCoordsFromPlacement(_ref, placement, rtl) {
			let { reference, floating } = _ref;
			const sideAxis = getSideAxis(placement);
			const alignmentAxis = getAlignmentAxis(placement);
			const alignLength = getAxisLength(alignmentAxis);
			const side = getSide(placement);
			const isVertical = sideAxis === "y";
			const commonX = reference.x + reference.width / 2 - floating.width / 2;
			const commonY = reference.y + reference.height / 2 - floating.height / 2;
			const commonAlign = reference[alignLength] / 2 - floating[alignLength] / 2;
			let coords;
			switch (side) {
				case "top":
					coords = {
						x: commonX,
						y: reference.y - floating.height
					};
					break;
				case "bottom":
					coords = {
						x: commonX,
						y: reference.y + reference.height
					};
					break;
				case "right":
					coords = {
						x: reference.x + reference.width,
						y: commonY
					};
					break;
				case "left":
					coords = {
						x: reference.x - floating.width,
						y: commonY
					};
					break;
				default: coords = {
					x: reference.x,
					y: reference.y
				};
			}
			const alignment = getAlignment(placement);
			if (alignment) coords[alignmentAxis] += commonAlign * (alignment === "end" ? 1 : -1) * (rtl && isVertical ? -1 : 1);
			return coords;
		}
		/**
		* Resolves with an object of overflow side offsets that determine how much the
		* element is overflowing a given clipping boundary on each side.
		* - positive = overflowing the boundary by that number of pixels
		* - negative = how many pixels left before it will overflow
		* - 0 = lies flush with the boundary
		* @see https://floating-ui.com/docs/detectOverflow
		*/
		async function detectOverflow(state, options) {
			var _await$platform$isEle;
			if (options === void 0) options = {};
			const { x, y, platform, rects, elements, strategy } = state;
			const { boundary = "clippingAncestors", rootBoundary = "viewport", elementContext = "floating", altBoundary = false, padding = 0 } = evaluate(options, state);
			const paddingObject = getPaddingObject(padding);
			const element = elements[altBoundary ? elementContext === "floating" ? "reference" : "floating" : elementContext];
			const clippingClientRect = rectToClientRect(await platform.getClippingRect({
				element: ((_await$platform$isEle = await (platform.isElement == null ? void 0 : platform.isElement(element))) != null ? _await$platform$isEle : true) ? element : element.contextElement || await (platform.getDocumentElement == null ? void 0 : platform.getDocumentElement(elements.floating)),
				boundary,
				rootBoundary,
				strategy
			}));
			const rect = elementContext === "floating" ? {
				x,
				y,
				width: rects.floating.width,
				height: rects.floating.height
			} : rects.reference;
			const offsetParent = await (platform.getOffsetParent == null ? void 0 : platform.getOffsetParent(elements.floating));
			const offsetScale = await (platform.isElement == null ? void 0 : platform.isElement(offsetParent)) && await (platform.getScale == null ? void 0 : platform.getScale(offsetParent)) || {
				x: 1,
				y: 1
			};
			const elementClientRect = rectToClientRect(platform.convertOffsetParentRelativeRectToViewportRelativeRect ? await platform.convertOffsetParentRelativeRectToViewportRelativeRect({
				elements,
				rect,
				offsetParent,
				strategy
			}) : rect);
			return {
				top: (clippingClientRect.top - elementClientRect.top + paddingObject.top) / offsetScale.y,
				bottom: (elementClientRect.bottom - clippingClientRect.bottom + paddingObject.bottom) / offsetScale.y,
				left: (clippingClientRect.left - elementClientRect.left + paddingObject.left) / offsetScale.x,
				right: (elementClientRect.right - clippingClientRect.right + paddingObject.right) / offsetScale.x
			};
		}
		const MAX_RESET_COUNT = 50;
		/**
		* Computes the `x` and `y` coordinates that will place the floating element
		* next to a given reference element.
		*
		* This export does not have any `platform` interface logic. You will need to
		* write one for the platform you are using Floating UI with.
		*/
		const computePosition$1 = async (reference, floating, config) => {
			const { placement = "bottom", strategy = "absolute", middleware = [], platform } = config;
			const platformWithDetectOverflow = platform.detectOverflow ? platform : {
				...platform,
				detectOverflow
			};
			const rtl = await (platform.isRTL == null ? void 0 : platform.isRTL(floating));
			let rects = await platform.getElementRects({
				reference,
				floating,
				strategy
			});
			let { x, y } = computeCoordsFromPlacement(rects, placement, rtl);
			let statefulPlacement = placement;
			let resetCount = 0;
			const middlewareData = {};
			for (let i = 0; i < middleware.length; i++) {
				const currentMiddleware = middleware[i];
				if (!currentMiddleware) continue;
				const { name, fn } = currentMiddleware;
				const { x: nextX, y: nextY, data, reset } = await fn({
					x,
					y,
					initialPlacement: placement,
					placement: statefulPlacement,
					strategy,
					middlewareData,
					rects,
					platform: platformWithDetectOverflow,
					elements: {
						reference,
						floating
					}
				});
				x = nextX != null ? nextX : x;
				y = nextY != null ? nextY : y;
				middlewareData[name] = {
					...middlewareData[name],
					...data
				};
				if (reset && resetCount < MAX_RESET_COUNT) {
					resetCount++;
					if (typeof reset === "object") {
						if (reset.placement) statefulPlacement = reset.placement;
						if (reset.rects) rects = reset.rects === true ? await platform.getElementRects({
							reference,
							floating,
							strategy
						}) : reset.rects;
						({x, y} = computeCoordsFromPlacement(rects, statefulPlacement, rtl));
					}
					i = -1;
				}
			}
			return {
				x,
				y,
				placement: statefulPlacement,
				strategy,
				middlewareData
			};
		};
		/**
		* Optimizes the visibility of the floating element by flipping the `placement`
		* in order to keep it in view when the preferred placement(s) will overflow the
		* clipping boundary. Alternative to `autoPlacement`.
		* @see https://floating-ui.com/docs/flip
		*/
		const flip$2 = function(options) {
			if (options === void 0) options = {};
			return {
				name: "flip",
				options,
				async fn(state) {
					var _middlewareData$arrow, _middlewareData$flip;
					const { placement, middlewareData, rects, initialPlacement, platform, elements } = state;
					const { mainAxis: checkMainAxis = true, crossAxis: checkCrossAxis = true, fallbackPlacements: specifiedFallbackPlacements, fallbackStrategy = "bestFit", fallbackAxisSideDirection = "none", flipAlignment = true, ...detectOverflowOptions } = evaluate(options, state);
					if ((_middlewareData$arrow = middlewareData.arrow) != null && _middlewareData$arrow.alignmentOffset) return {};
					const side = getSide(placement);
					const initialSideAxis = getSideAxis(initialPlacement);
					const isBasePlacement = getSide(initialPlacement) === initialPlacement;
					const rtl = await (platform.isRTL == null ? void 0 : platform.isRTL(elements.floating));
					const fallbackPlacements = specifiedFallbackPlacements || (isBasePlacement || !flipAlignment ? [getOppositePlacement(initialPlacement)] : getExpandedPlacements(initialPlacement));
					const hasFallbackAxisSideDirection = fallbackAxisSideDirection !== "none";
					if (!specifiedFallbackPlacements && hasFallbackAxisSideDirection) fallbackPlacements.push(...getOppositeAxisPlacements(initialPlacement, flipAlignment, fallbackAxisSideDirection, rtl));
					const placements = [initialPlacement, ...fallbackPlacements];
					const overflow = await platform.detectOverflow(state, detectOverflowOptions);
					const overflows = [];
					let overflowsData = ((_middlewareData$flip = middlewareData.flip) == null ? void 0 : _middlewareData$flip.overflows) || [];
					if (checkMainAxis) overflows.push(overflow[side]);
					if (checkCrossAxis) {
						const sides = getAlignmentSides(placement, rects, rtl);
						overflows.push(overflow[sides[0]], overflow[sides[1]]);
					}
					overflowsData = [...overflowsData, {
						placement,
						overflows
					}];
					if (!overflows.every((side) => side <= 0)) {
						var _middlewareData$flip2, _overflowsData$filter;
						const nextIndex = (((_middlewareData$flip2 = middlewareData.flip) == null ? void 0 : _middlewareData$flip2.index) || 0) + 1;
						const nextPlacement = placements[nextIndex];
						if (nextPlacement) {
							if (!(checkCrossAxis === "alignment" ? initialSideAxis !== getSideAxis(nextPlacement) : false) || overflowsData.every((d) => getSideAxis(d.placement) === initialSideAxis ? d.overflows[0] > 0 : true)) return {
								data: {
									index: nextIndex,
									overflows: overflowsData
								},
								reset: { placement: nextPlacement }
							};
						}
						let resetPlacement = (_overflowsData$filter = overflowsData.filter((d) => d.overflows[0] <= 0).sort((a, b) => a.overflows[1] - b.overflows[1])[0]) == null ? void 0 : _overflowsData$filter.placement;
						if (!resetPlacement) switch (fallbackStrategy) {
							case "bestFit": {
								var _overflowsData$filter2;
								const placement = (_overflowsData$filter2 = overflowsData.filter((d) => {
									if (hasFallbackAxisSideDirection) {
										const currentSideAxis = getSideAxis(d.placement);
										return currentSideAxis === initialSideAxis || currentSideAxis === "y";
									}
									return true;
								}).map((d) => [d.placement, d.overflows.filter((overflow) => overflow > 0).reduce((acc, overflow) => acc + overflow, 0)]).sort((a, b) => a[1] - b[1])[0]) == null ? void 0 : _overflowsData$filter2[0];
								if (placement) resetPlacement = placement;
								break;
							}
							case "initialPlacement": resetPlacement = initialPlacement;
						}
						if (placement !== resetPlacement) return { reset: { placement: resetPlacement } };
					}
					return {};
				}
			};
		};
		const originSides = /*#__PURE__*/ new Set(["left", "top"]);
		async function convertValueToCoords(state, options) {
			const { placement, platform, elements } = state;
			const rtl = await (platform.isRTL == null ? void 0 : platform.isRTL(elements.floating));
			const side = getSide(placement);
			const alignment = getAlignment(placement);
			const isVertical = getSideAxis(placement) === "y";
			const mainAxisMulti = originSides.has(side) ? -1 : 1;
			const crossAxisMulti = rtl && isVertical ? -1 : 1;
			const rawValue = evaluate(options, state);
			let { mainAxis, crossAxis, alignmentAxis } = typeof rawValue === "number" ? {
				mainAxis: rawValue,
				crossAxis: 0,
				alignmentAxis: null
			} : {
				mainAxis: rawValue.mainAxis || 0,
				crossAxis: rawValue.crossAxis || 0,
				alignmentAxis: rawValue.alignmentAxis
			};
			if (alignment && typeof alignmentAxis === "number") crossAxis = alignment === "end" ? alignmentAxis * -1 : alignmentAxis;
			return isVertical ? {
				x: crossAxis * crossAxisMulti,
				y: mainAxis * mainAxisMulti
			} : {
				x: mainAxis * mainAxisMulti,
				y: crossAxis * crossAxisMulti
			};
		}
		/**
		* Modifies the placement by translating the floating element along the
		* specified axes.
		* A number (shorthand for `mainAxis` or distance), or an axes configuration
		* object may be passed.
		* @see https://floating-ui.com/docs/offset
		*/
		const offset$2 = function(options) {
			if (options === void 0) options = 0;
			return {
				name: "offset",
				options,
				async fn(state) {
					var _middlewareData$offse, _middlewareData$arrow;
					const { x, y, placement, middlewareData } = state;
					const diffCoords = await convertValueToCoords(state, options);
					if (placement === ((_middlewareData$offse = middlewareData.offset) == null ? void 0 : _middlewareData$offse.placement) && (_middlewareData$arrow = middlewareData.arrow) != null && _middlewareData$arrow.alignmentOffset) return {};
					return {
						x: x + diffCoords.x,
						y: y + diffCoords.y,
						data: {
							...diffCoords,
							placement
						}
					};
				}
			};
		};
		/**
		* Optimizes the visibility of the floating element by shifting it in order to
		* keep it in view when it will overflow the clipping boundary.
		* @see https://floating-ui.com/docs/shift
		*/
		const shift$2 = function(options) {
			if (options === void 0) options = {};
			return {
				name: "shift",
				options,
				async fn(state) {
					const { x, y, placement, platform } = state;
					const { mainAxis: checkMainAxis = true, crossAxis: checkCrossAxis = false, limiter = { fn: (_ref) => {
						let { x, y } = _ref;
						return {
							x,
							y
						};
					} }, ...detectOverflowOptions } = evaluate(options, state);
					const coords = {
						x,
						y
					};
					const overflow = await platform.detectOverflow(state, detectOverflowOptions);
					const crossAxis = getSideAxis(placement);
					const mainAxis = getOppositeAxis(crossAxis);
					let mainAxisCoord = coords[mainAxis];
					let crossAxisCoord = coords[crossAxis];
					const clampCoord = (axis, coord) => clamp(coord + overflow[axis === "y" ? "top" : "left"], coord, coord - overflow[axis === "y" ? "bottom" : "right"]);
					if (checkMainAxis) mainAxisCoord = clampCoord(mainAxis, mainAxisCoord);
					if (checkCrossAxis) crossAxisCoord = clampCoord(crossAxis, crossAxisCoord);
					const limitedCoords = limiter.fn({
						...state,
						[mainAxis]: mainAxisCoord,
						[crossAxis]: crossAxisCoord
					});
					return {
						...limitedCoords,
						data: {
							x: limitedCoords.x - x,
							y: limitedCoords.y - y,
							enabled: {
								[mainAxis]: checkMainAxis,
								[crossAxis]: checkCrossAxis
							}
						}
					};
				}
			};
		};
		/**
		* Built-in `limiter` that will stop `shift()` at a certain point.
		*/
		const limitShift$2 = function(options) {
			if (options === void 0) options = {};
			return {
				options,
				fn(state) {
					var _rawOffset$mainAxis, _rawOffset$crossAxis;
					const { x, y, placement, rects, middlewareData } = state;
					const { offset = 0, mainAxis: checkMainAxis = true, crossAxis: checkCrossAxis = true } = evaluate(options, state);
					const coords = {
						x,
						y
					};
					const crossAxis = getSideAxis(placement);
					const mainAxis = getOppositeAxis(crossAxis);
					let mainAxisCoord = coords[mainAxis];
					let crossAxisCoord = coords[crossAxis];
					const rawOffset = evaluate(offset, state);
					const computedOffset = typeof rawOffset === "number" ? {
						mainAxis: rawOffset,
						crossAxis: 0
					} : {
						mainAxis: (_rawOffset$mainAxis = rawOffset.mainAxis) != null ? _rawOffset$mainAxis : 0,
						crossAxis: (_rawOffset$crossAxis = rawOffset.crossAxis) != null ? _rawOffset$crossAxis : 0
					};
					if (checkMainAxis) {
						const len = mainAxis === "y" ? "height" : "width";
						const limitMin = rects.reference[mainAxis] - rects.floating[len] + computedOffset.mainAxis;
						const limitMax = rects.reference[mainAxis] + rects.reference[len] - computedOffset.mainAxis;
						if (mainAxisCoord < limitMin) mainAxisCoord = limitMin;
						else if (mainAxisCoord > limitMax) mainAxisCoord = limitMax;
					}
					if (checkCrossAxis) {
						var _middlewareData$offse, _middlewareData$offse2;
						const len = mainAxis === "y" ? "width" : "height";
						const isOriginSide = originSides.has(getSide(placement));
						const limitMin = rects.reference[crossAxis] - rects.floating[len] + (isOriginSide ? ((_middlewareData$offse = middlewareData.offset) == null ? void 0 : _middlewareData$offse[crossAxis]) || 0 : 0) + (isOriginSide ? 0 : computedOffset.crossAxis);
						const limitMax = rects.reference[crossAxis] + rects.reference[len] + (isOriginSide ? 0 : ((_middlewareData$offse2 = middlewareData.offset) == null ? void 0 : _middlewareData$offse2[crossAxis]) || 0) - (isOriginSide ? computedOffset.crossAxis : 0);
						if (crossAxisCoord < limitMin) crossAxisCoord = limitMin;
						else if (crossAxisCoord > limitMax) crossAxisCoord = limitMax;
					}
					return {
						[mainAxis]: mainAxisCoord,
						[crossAxis]: crossAxisCoord
					};
				}
			};
		};
		/**
		* Provides data that allows you to change the size of the floating element —
		* for instance, prevent it from overflowing the clipping boundary or match the
		* width of the reference element.
		* @see https://floating-ui.com/docs/size
		*/
		const size$2 = function(options) {
			if (options === void 0) options = {};
			return {
				name: "size",
				options,
				async fn(state) {
					const { placement, rects, platform, elements } = state;
					const { apply = () => {}, ...detectOverflowOptions } = evaluate(options, state);
					const overflow = await platform.detectOverflow(state, detectOverflowOptions);
					const side = getSide(placement);
					const alignment = getAlignment(placement);
					const isYAxis = getSideAxis(placement) === "y";
					const { width, height } = rects.floating;
					let heightSide;
					let widthSide;
					if (side === "top" || side === "bottom") {
						heightSide = side;
						widthSide = alignment === (await (platform.isRTL == null ? void 0 : platform.isRTL(elements.floating)) ? "start" : "end") ? "left" : "right";
					} else {
						widthSide = side;
						heightSide = alignment === "end" ? "top" : "bottom";
					}
					const maximumClippingHeight = height - overflow.top - overflow.bottom;
					const maximumClippingWidth = width - overflow.left - overflow.right;
					const overflowAvailableHeight = min(height - overflow[heightSide], maximumClippingHeight);
					const overflowAvailableWidth = min(width - overflow[widthSide], maximumClippingWidth);
					const shiftData = state.middlewareData.shift;
					const noShift = !shiftData;
					let availableHeight = overflowAvailableHeight;
					let availableWidth = overflowAvailableWidth;
					if (shiftData != null && shiftData.enabled.x) availableWidth = maximumClippingWidth;
					if (shiftData != null && shiftData.enabled.y) availableHeight = maximumClippingHeight;
					if (noShift && !alignment) {
						if (isYAxis) availableWidth = width - 2 * max(overflow.left, overflow.right);
						else availableHeight = height - 2 * max(overflow.top, overflow.bottom);
					}
					await apply({
						...state,
						availableWidth,
						availableHeight
					});
					const nextDimensions = await platform.getDimensions(elements.floating);
					if (width !== nextDimensions.width || height !== nextDimensions.height) return { reset: { rects: true } };
					return {};
				}
			};
		};
		//#endregion
		//#region node_modules/.pnpm/@floating-ui+dom@1.8.0/node_modules/@floating-ui/dom/dist/floating-ui.dom.mjs
		function getCssDimensions(element) {
			const css = getComputedStyle$1(element);
			let width = parseFloat(css.width) || 0;
			let height = parseFloat(css.height) || 0;
			const hasOffset = isHTMLElement(element);
			const offsetWidth = hasOffset ? element.offsetWidth : width;
			const offsetHeight = hasOffset ? element.offsetHeight : height;
			const shouldFallback = round(width) !== offsetWidth || round(height) !== offsetHeight;
			if (shouldFallback) {
				width = offsetWidth;
				height = offsetHeight;
			}
			return {
				width,
				height,
				$: shouldFallback
			};
		}
		function unwrapElement(element) {
			return !isElement(element) ? element.contextElement : element;
		}
		function getScale(element) {
			const domElement = unwrapElement(element);
			if (!isHTMLElement(domElement)) return createCoords(1);
			const rect = domElement.getBoundingClientRect();
			const { width, height, $ } = getCssDimensions(domElement);
			let x = ($ ? round(rect.width) : rect.width) / width;
			let y = ($ ? round(rect.height) : rect.height) / height;
			if (!x || !Number.isFinite(x)) x = 1;
			if (!y || !Number.isFinite(y)) y = 1;
			return {
				x,
				y
			};
		}
		const noOffsets = /*#__PURE__*/ createCoords(0);
		function getVisualOffsets(element) {
			const win = getWindow(element);
			if (!isWebKit() || !win.visualViewport) return noOffsets;
			return {
				x: win.visualViewport.offsetLeft,
				y: win.visualViewport.offsetTop
			};
		}
		function shouldAddVisualOffsets(element, isFixed, floatingOffsetParent) {
			if (isFixed === void 0) isFixed = false;
			return !!floatingOffsetParent && isFixed && floatingOffsetParent === getWindow(element);
		}
		function getBoundingClientRect(element, includeScale, isFixedStrategy, offsetParent) {
			if (includeScale === void 0) includeScale = false;
			if (isFixedStrategy === void 0) isFixedStrategy = false;
			const clientRect = element.getBoundingClientRect();
			const domElement = unwrapElement(element);
			let scale = createCoords(1);
			if (includeScale) {
				if (offsetParent) {
					if (isElement(offsetParent)) scale = getScale(offsetParent);
				} else scale = getScale(element);
			}
			const visualOffsets = shouldAddVisualOffsets(domElement, isFixedStrategy, offsetParent) ? getVisualOffsets(domElement) : createCoords(0);
			let x = (clientRect.left + visualOffsets.x) / scale.x;
			let y = (clientRect.top + visualOffsets.y) / scale.y;
			let width = clientRect.width / scale.x;
			let height = clientRect.height / scale.y;
			if (domElement && offsetParent) {
				const win = getWindow(domElement);
				const offsetWin = isElement(offsetParent) ? getWindow(offsetParent) : offsetParent;
				let currentWin = win;
				let currentIFrame = getFrameElement(currentWin);
				while (currentIFrame && offsetWin !== currentWin) {
					const iframeScale = getScale(currentIFrame);
					const iframeRect = currentIFrame.getBoundingClientRect();
					const css = getComputedStyle$1(currentIFrame);
					const left = iframeRect.left + (currentIFrame.clientLeft + parseFloat(css.paddingLeft)) * iframeScale.x;
					const top = iframeRect.top + (currentIFrame.clientTop + parseFloat(css.paddingTop)) * iframeScale.y;
					x *= iframeScale.x;
					y *= iframeScale.y;
					width *= iframeScale.x;
					height *= iframeScale.y;
					x += left;
					y += top;
					currentWin = getWindow(currentIFrame);
					currentIFrame = getFrameElement(currentWin);
				}
			}
			return rectToClientRect({
				width,
				height,
				x,
				y
			});
		}
		function getWindowScrollBarX(element, rect) {
			const leftScroll = getNodeScroll(element).scrollLeft;
			if (!rect) return getBoundingClientRect(getDocumentElement(element)).left + leftScroll;
			return rect.left + leftScroll;
		}
		function getHTMLOffset(documentElement, scroll) {
			const htmlRect = documentElement.getBoundingClientRect();
			return {
				x: htmlRect.left + scroll.scrollLeft - getWindowScrollBarX(documentElement, htmlRect),
				y: htmlRect.top + scroll.scrollTop
			};
		}
		function convertOffsetParentRelativeRectToViewportRelativeRect(_ref) {
			let { elements, rect, offsetParent, strategy } = _ref;
			const isFixed = strategy === "fixed";
			const documentElement = getDocumentElement(offsetParent);
			const topLayer = elements ? isTopLayer(elements.floating) : false;
			if (offsetParent === documentElement || topLayer && isFixed) return rect;
			let scroll = {
				scrollLeft: 0,
				scrollTop: 0
			};
			let scale = createCoords(1);
			const offsets = createCoords(0);
			const isOffsetParentAnElement = isHTMLElement(offsetParent);
			if (isOffsetParentAnElement || !isFixed) {
				if (getNodeName(offsetParent) !== "body" || isOverflowElement(documentElement)) scroll = getNodeScroll(offsetParent);
				if (isOffsetParentAnElement) {
					const offsetRect = getBoundingClientRect(offsetParent);
					scale = getScale(offsetParent);
					offsets.x = offsetRect.x + offsetParent.clientLeft;
					offsets.y = offsetRect.y + offsetParent.clientTop;
				}
			}
			const htmlOffset = documentElement && !isOffsetParentAnElement && !isFixed ? getHTMLOffset(documentElement, scroll) : createCoords(0);
			return {
				width: rect.width * scale.x,
				height: rect.height * scale.y,
				x: rect.x * scale.x - scroll.scrollLeft * scale.x + offsets.x + htmlOffset.x,
				y: rect.y * scale.y - scroll.scrollTop * scale.y + offsets.y + htmlOffset.y
			};
		}
		function getClientRects(element) {
			return element.getClientRects ? Array.from(element.getClientRects()) : [];
		}
		function getDocumentRect(html) {
			const scroll = getNodeScroll(html);
			const body = html.ownerDocument.body;
			const width = max(html.scrollWidth, html.clientWidth, body.scrollWidth, body.clientWidth);
			const height = max(html.scrollHeight, html.clientHeight, body.scrollHeight, body.clientHeight);
			let x = -scroll.scrollLeft + getWindowScrollBarX(html);
			const y = -scroll.scrollTop;
			if (getComputedStyle$1(body).direction === "rtl") x += max(html.clientWidth, body.clientWidth) - width;
			return {
				width,
				height,
				x,
				y
			};
		}
		const SCROLLBAR_MAX = 25;
		function getViewportRect(element, strategy, rootBoundary) {
			if (rootBoundary === void 0) rootBoundary = "viewport";
			const isLayoutViewport = rootBoundary === "layoutViewport";
			const win = getWindow(element);
			const html = getDocumentElement(element);
			const visualViewport = win.visualViewport;
			let width = html.clientWidth;
			let height = html.clientHeight;
			let x = 0;
			let y = 0;
			if (visualViewport) {
				const layoutRelativeClientCoords = !isWebKit() || strategy === "fixed";
				if (isLayoutViewport) {
					if (!layoutRelativeClientCoords) {
						x = -visualViewport.offsetLeft;
						y = -visualViewport.offsetTop;
					}
				} else {
					width = visualViewport.width;
					height = visualViewport.height;
					if (layoutRelativeClientCoords) {
						x = visualViewport.offsetLeft;
						y = visualViewport.offsetTop;
					}
				}
			}
			if (getWindowScrollBarX(html) <= 0) {
				const doc = html.ownerDocument;
				const body = doc.body;
				const bodyStyles = getComputedStyle(body);
				const bodyMarginInline = doc.compatMode === "CSS1Compat" ? parseFloat(bodyStyles.marginLeft) + parseFloat(bodyStyles.marginRight) || 0 : 0;
				const reservedWidth = Math.abs(html.clientWidth - body.clientWidth - bodyMarginInline);
				const gutter = getComputedStyle(html).scrollbarGutter === "stable both-edges" ? reservedWidth / 2 : reservedWidth;
				if (gutter <= SCROLLBAR_MAX) width -= gutter;
			}
			return {
				width,
				height,
				x,
				y
			};
		}
		function getInnerBoundingClientRect(element, strategy) {
			const clientRect = getBoundingClientRect(element, true, strategy === "fixed");
			const top = clientRect.top + element.clientTop;
			const left = clientRect.left + element.clientLeft;
			const scale = getScale(element);
			return {
				width: element.clientWidth * scale.x,
				height: element.clientHeight * scale.y,
				x: left * scale.x,
				y: top * scale.y
			};
		}
		function getClientRectFromClippingAncestor(element, clippingAncestor, strategy) {
			let rect;
			if (clippingAncestor === "viewport" || clippingAncestor === "layoutViewport") rect = getViewportRect(element, strategy, clippingAncestor);
			else if (clippingAncestor === "document") rect = getDocumentRect(getDocumentElement(element));
			else if (isElement(clippingAncestor)) rect = getInnerBoundingClientRect(clippingAncestor, strategy);
			else {
				const visualOffsets = getVisualOffsets(element);
				rect = {
					x: clippingAncestor.x - visualOffsets.x,
					y: clippingAncestor.y - visualOffsets.y,
					width: clippingAncestor.width,
					height: clippingAncestor.height
				};
			}
			return rectToClientRect(rect);
		}
		function getClippingElementAncestors(element, cache) {
			const cachedResult = cache.get(element);
			if (cachedResult) return cachedResult;
			let result = getOverflowAncestors(element, [], false).filter((el) => isElement(el) && getNodeName(el) !== "body");
			let lastKeptComputedStyle = null;
			const elementIsFixed = getComputedStyle$1(element).position === "fixed";
			let currentNode = elementIsFixed ? getParentNode(element) : element;
			while (isElement(currentNode) && !isLastTraversableNode(currentNode)) {
				const computedStyle = getComputedStyle$1(currentNode);
				const currentNodeIsContaining = isContainingBlock(currentNode);
				const lastPosition = lastKeptComputedStyle ? lastKeptComputedStyle.position : elementIsFixed ? "fixed" : "";
				if (!currentNodeIsContaining && (lastPosition === "fixed" || lastPosition === "absolute" && computedStyle.position === "static")) result = result.filter((ancestor) => ancestor !== currentNode);
				else lastKeptComputedStyle = computedStyle;
				currentNode = getParentNode(currentNode);
			}
			cache.set(element, result);
			return result;
		}
		function getClippingRect(_ref) {
			let { element, boundary, rootBoundary, strategy } = _ref;
			const clippingAncestors = [...boundary === "clippingAncestors" ? isTopLayer(element) ? [] : getClippingElementAncestors(element, this._c) : [].concat(boundary), rootBoundary];
			const firstRect = getClientRectFromClippingAncestor(element, clippingAncestors[0], strategy);
			let top = firstRect.top;
			let right = firstRect.right;
			let bottom = firstRect.bottom;
			let left = firstRect.left;
			for (let i = 1; i < clippingAncestors.length; i++) {
				const rect = getClientRectFromClippingAncestor(element, clippingAncestors[i], strategy);
				top = max(rect.top, top);
				right = min(rect.right, right);
				bottom = min(rect.bottom, bottom);
				left = max(rect.left, left);
			}
			return {
				width: right - left,
				height: bottom - top,
				x: left,
				y: top
			};
		}
		function getDimensions(element) {
			const { width, height } = getCssDimensions(element);
			return {
				width,
				height
			};
		}
		function getRectRelativeToOffsetParent(element, offsetParent, strategy) {
			const isOffsetParentAnElement = isHTMLElement(offsetParent);
			const documentElement = getDocumentElement(offsetParent);
			const isFixed = strategy === "fixed";
			const rect = getBoundingClientRect(element, true, isFixed, offsetParent);
			let scroll = {
				scrollLeft: 0,
				scrollTop: 0
			};
			const offsets = createCoords(0);
			if (isOffsetParentAnElement || !isFixed) {
				if (getNodeName(offsetParent) !== "body" || isOverflowElement(documentElement)) scroll = getNodeScroll(offsetParent);
				if (isOffsetParentAnElement) {
					const offsetRect = getBoundingClientRect(offsetParent, true, isFixed, offsetParent);
					offsets.x = offsetRect.x + offsetParent.clientLeft;
					offsets.y = offsetRect.y + offsetParent.clientTop;
				}
			}
			if (!isOffsetParentAnElement && documentElement) offsets.x = getWindowScrollBarX(documentElement);
			const htmlOffset = documentElement && !isOffsetParentAnElement && !isFixed ? getHTMLOffset(documentElement, scroll) : createCoords(0);
			return {
				x: rect.left + scroll.scrollLeft - offsets.x - htmlOffset.x,
				y: rect.top + scroll.scrollTop - offsets.y - htmlOffset.y,
				width: rect.width,
				height: rect.height
			};
		}
		function isStaticPositioned(element) {
			return getComputedStyle$1(element).position === "static";
		}
		function getTrueOffsetParent(element, polyfill) {
			if (!isHTMLElement(element) || getComputedStyle$1(element).position === "fixed") return null;
			if (polyfill) return polyfill(element);
			let rawOffsetParent = element.offsetParent;
			if (getDocumentElement(element) === rawOffsetParent) rawOffsetParent = rawOffsetParent.ownerDocument.body;
			return rawOffsetParent;
		}
		function getOffsetParent(element, polyfill) {
			const win = getWindow(element);
			if (isTopLayer(element)) return win;
			if (!isHTMLElement(element)) {
				let svgOffsetParent = getParentNode(element);
				while (svgOffsetParent && !isLastTraversableNode(svgOffsetParent)) {
					if (isElement(svgOffsetParent) && !isStaticPositioned(svgOffsetParent)) return svgOffsetParent;
					svgOffsetParent = getParentNode(svgOffsetParent);
				}
				return win;
			}
			let offsetParent = getTrueOffsetParent(element, polyfill);
			while (offsetParent && isTableElement(offsetParent) && isStaticPositioned(offsetParent)) offsetParent = getTrueOffsetParent(offsetParent, polyfill);
			if (offsetParent && isLastTraversableNode(offsetParent) && isStaticPositioned(offsetParent) && !isContainingBlock(offsetParent)) return win;
			return offsetParent || getContainingBlock(element) || win;
		}
		const getElementRects = async function(data) {
			const getOffsetParentFn = this.getOffsetParent || getOffsetParent;
			const getDimensionsFn = this.getDimensions;
			const floatingDimensions = await getDimensionsFn(data.floating);
			return {
				reference: getRectRelativeToOffsetParent(data.reference, await getOffsetParentFn(data.floating), data.strategy),
				floating: {
					x: 0,
					y: 0,
					width: floatingDimensions.width,
					height: floatingDimensions.height
				}
			};
		};
		function isRTL(element) {
			return getComputedStyle$1(element).direction === "rtl";
		}
		const platform = {
			convertOffsetParentRelativeRectToViewportRelativeRect,
			getDocumentElement,
			getClippingRect,
			getOffsetParent,
			getElementRects,
			getClientRects,
			getDimensions,
			getScale,
			isElement,
			isRTL
		};
		function rectsAreEqual(a, b) {
			return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
		}
		function observeMove(element, onMove, ancestorResize) {
			let io = null;
			let timeoutId;
			const root = getDocumentElement(element);
			function cleanup() {
				var _io;
				clearTimeout(timeoutId);
				(_io = io) == null || _io.disconnect();
				io = null;
			}
			function refresh(skip, threshold) {
				if (skip === void 0) skip = false;
				if (threshold === void 0) threshold = 1;
				cleanup();
				const elementRectForRootMargin = element.getBoundingClientRect();
				const { left, top, width, height } = elementRectForRootMargin;
				if (!skip) onMove();
				if (!width || !height) return;
				const insetTop = floor(top);
				const insetRight = floor(root.clientWidth - (left + width));
				const insetBottom = floor(root.clientHeight - (top + height));
				const insetLeft = floor(left);
				const options = {
					rootMargin: -insetTop + "px " + -insetRight + "px " + -insetBottom + "px " + -insetLeft + "px",
					threshold: max(0, min(1, threshold)) || 1
				};
				let isFirstUpdate = true;
				function handleObserve(entries) {
					const ratio = entries[0].intersectionRatio;
					if (!rectsAreEqual(elementRectForRootMargin, element.getBoundingClientRect())) return refresh();
					if (ratio !== threshold) {
						if (!isFirstUpdate) return refresh();
						if (!ratio) timeoutId = setTimeout(() => {
							refresh(false, 1e-7);
						}, 1e3);
						else refresh(false, ratio);
					}
					isFirstUpdate = false;
				}
				try {
					io = new IntersectionObserver(handleObserve, {
						...options,
						root: root.ownerDocument
					});
				} catch (_e) {
					io = new IntersectionObserver(handleObserve, options);
				}
				io.observe(element);
			}
			const win = getWindow(element);
			const handleResize = () => refresh(ancestorResize);
			win.addEventListener("resize", handleResize);
			refresh(true);
			return () => {
				win.removeEventListener("resize", handleResize);
				cleanup();
			};
		}
		/**
		* Automatically updates the position of the floating element when necessary.
		* Should only be called when the floating element is mounted on the DOM or
		* visible on the screen.
		* @returns cleanup function that should be invoked when the floating element is
		* removed from the DOM or hidden from the screen.
		* @see https://floating-ui.com/docs/autoUpdate
		*/
		function autoUpdate(reference, floating, update, options) {
			if (options === void 0) options = {};
			const { ancestorScroll = true, ancestorResize = true, elementResize = typeof ResizeObserver === "function", layoutShift = typeof IntersectionObserver === "function", animationFrame = false } = options;
			const referenceEl = unwrapElement(reference);
			const ancestors = ancestorScroll || ancestorResize ? [...referenceEl ? getOverflowAncestors(referenceEl) : [], ...floating ? getOverflowAncestors(floating) : []] : [];
			ancestors.forEach((ancestor) => {
				ancestorScroll && ancestor.addEventListener("scroll", update);
				ancestorResize && ancestor.addEventListener("resize", update);
			});
			const cleanupIo = referenceEl && layoutShift ? observeMove(referenceEl, update, ancestorResize) : null;
			let reobserveFrame = -1;
			let resizeObserver = null;
			if (elementResize) {
				resizeObserver = new ResizeObserver((_ref) => {
					let [firstEntry] = _ref;
					if (firstEntry && firstEntry.target === referenceEl && resizeObserver && floating) {
						resizeObserver.unobserve(floating);
						cancelAnimationFrame(reobserveFrame);
						reobserveFrame = requestAnimationFrame(() => {
							var _resizeObserver;
							(_resizeObserver = resizeObserver) == null || _resizeObserver.observe(floating);
						});
					}
					update();
				});
				if (referenceEl && !animationFrame) resizeObserver.observe(referenceEl);
				if (floating) resizeObserver.observe(floating);
			}
			let frameId;
			let prevRefRect = animationFrame ? getBoundingClientRect(reference) : null;
			if (animationFrame) frameLoop();
			function frameLoop() {
				const nextRefRect = getBoundingClientRect(reference);
				if (prevRefRect && !rectsAreEqual(prevRefRect, nextRefRect)) update();
				prevRefRect = nextRefRect;
				frameId = requestAnimationFrame(frameLoop);
			}
			update();
			return () => {
				var _resizeObserver2;
				ancestors.forEach((ancestor) => {
					ancestorScroll && ancestor.removeEventListener("scroll", update);
					ancestorResize && ancestor.removeEventListener("resize", update);
				});
				cleanupIo?.();
				(_resizeObserver2 = resizeObserver) == null || _resizeObserver2.disconnect();
				resizeObserver = null;
				if (animationFrame) cancelAnimationFrame(frameId);
			};
		}
		/**
		* Modifies the placement by translating the floating element along the
		* specified axes.
		* A number (shorthand for `mainAxis` or distance), or an axes configuration
		* object may be passed.
		* @see https://floating-ui.com/docs/offset
		*/
		const offset$1 = offset$2;
		/**
		* Optimizes the visibility of the floating element by shifting it in order to
		* keep it in view when it will overflow the clipping boundary.
		* @see https://floating-ui.com/docs/shift
		*/
		const shift$1 = shift$2;
		/**
		* Optimizes the visibility of the floating element by flipping the `placement`
		* in order to keep it in view when the preferred placement(s) will overflow the
		* clipping boundary. Alternative to `autoPlacement`.
		* @see https://floating-ui.com/docs/flip
		*/
		const flip$1 = flip$2;
		/**
		* Provides data that allows you to change the size of the floating element —
		* for instance, prevent it from overflowing the clipping boundary or match the
		* width of the reference element.
		* @see https://floating-ui.com/docs/size
		*/
		const size$1 = size$2;
		/**
		* Built-in `limiter` that will stop `shift()` at a certain point.
		*/
		const limitShift$1 = limitShift$2;
		/**
		* Computes the `x` and `y` coordinates that will place the floating element
		* next to a given reference element.
		*/
		const computePosition = (reference, floating, options) => {
			const cache = /* @__PURE__ */ new Map();
			const mergedOptions = options != null ? options : {};
			const platformWithCache = {
				...platform,
				...mergedOptions.platform,
				_c: cache
			};
			return computePosition$1(reference, floating, {
				...mergedOptions,
				platform: platformWithCache
			});
		};
		//#endregion
		//#region node_modules/.pnpm/@floating-ui+react-dom@2.1.9_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@floating-ui/react-dom/dist/floating-ui.react-dom.mjs
		var index = typeof document !== "undefined" ? react.useLayoutEffect : function noop() {};
		function deepEqual(a, b) {
			if (a === b) return true;
			if (typeof a !== typeof b) return false;
			if (typeof a === "function" && a.toString() === b.toString()) return true;
			let length;
			let i;
			let keys;
			if (a && b && typeof a === "object") {
				if (Array.isArray(a)) {
					length = a.length;
					if (length !== b.length) return false;
					for (i = length; i-- !== 0;) if (!deepEqual(a[i], b[i])) return false;
					return true;
				}
				keys = Object.keys(a);
				length = keys.length;
				if (length !== Object.keys(b).length) return false;
				for (i = length; i-- !== 0;) if (!{}.hasOwnProperty.call(b, keys[i])) return false;
				for (i = length; i-- !== 0;) {
					const key = keys[i];
					if (key === "_owner" && a.$$typeof) continue;
					if (!deepEqual(a[key], b[key])) return false;
				}
				return true;
			}
			return a !== a && b !== b;
		}
		function getDPR(element) {
			if (typeof window === "undefined") return 1;
			return (element.ownerDocument.defaultView || window).devicePixelRatio || 1;
		}
		function roundByDPR(element, value) {
			const dpr = getDPR(element);
			return Math.round(value * dpr) / dpr;
		}
		function useLatestRef(value) {
			const ref = react.useRef(value);
			index(() => {
				ref.current = value;
			});
			return ref;
		}
		/**
		* Provides data to position a floating element.
		* @see https://floating-ui.com/docs/useFloating
		*/
		function useFloating(options) {
			if (options === void 0) options = {};
			const { placement = "bottom", strategy = "absolute", middleware = [], platform, elements: { reference: externalReference, floating: externalFloating } = {}, transform = true, whileElementsMounted, open } = options;
			const [data, setData] = react.useState({
				x: 0,
				y: 0,
				strategy,
				placement,
				middlewareData: {},
				isPositioned: false
			});
			const [latestMiddleware, setLatestMiddleware] = react.useState(middleware);
			if (!deepEqual(latestMiddleware, middleware)) setLatestMiddleware(middleware);
			const [_reference, _setReference] = react.useState(null);
			const [_floating, _setFloating] = react.useState(null);
			const setReference = react.useCallback((node) => {
				if (node !== referenceRef.current) {
					referenceRef.current = node;
					_setReference(node);
				}
			}, []);
			const setFloating = react.useCallback((node) => {
				if (node !== floatingRef.current) {
					floatingRef.current = node;
					_setFloating(node);
				}
			}, []);
			const referenceEl = externalReference || _reference;
			const floatingEl = externalFloating || _floating;
			const referenceRef = react.useRef(null);
			const floatingRef = react.useRef(null);
			const dataRef = react.useRef(data);
			const hasWhileElementsMounted = whileElementsMounted != null;
			const whileElementsMountedRef = useLatestRef(whileElementsMounted);
			const platformRef = useLatestRef(platform);
			const openRef = useLatestRef(open);
			const update = react.useCallback(() => {
				if (!referenceRef.current || !floatingRef.current) return;
				const config = {
					placement,
					strategy,
					middleware: latestMiddleware
				};
				if (platformRef.current) config.platform = platformRef.current;
				computePosition(referenceRef.current, floatingRef.current, config).then((data) => {
					const fullData = {
						...data,
						isPositioned: openRef.current !== false
					};
					if (isMountedRef.current && !deepEqual(dataRef.current, fullData)) {
						dataRef.current = fullData;
						react_dom.flushSync(() => {
							setData(fullData);
						});
					}
				});
			}, [
				latestMiddleware,
				placement,
				strategy,
				platformRef,
				openRef
			]);
			index(() => {
				if (open === false && dataRef.current.isPositioned) {
					dataRef.current.isPositioned = false;
					setData((data) => ({
						...data,
						isPositioned: false
					}));
				}
			}, [open]);
			const isMountedRef = react.useRef(false);
			index(() => {
				isMountedRef.current = true;
				return () => {
					isMountedRef.current = false;
				};
			}, []);
			index(() => {
				if (referenceEl) referenceRef.current = referenceEl;
				if (floatingEl) floatingRef.current = floatingEl;
				if (referenceEl && floatingEl) {
					if (whileElementsMountedRef.current) return whileElementsMountedRef.current(referenceEl, floatingEl, update);
					update();
				}
			}, [
				referenceEl,
				floatingEl,
				update,
				whileElementsMountedRef,
				hasWhileElementsMounted
			]);
			const refs = react.useMemo(() => ({
				reference: referenceRef,
				floating: floatingRef,
				setReference,
				setFloating
			}), [setReference, setFloating]);
			const elements = react.useMemo(() => ({
				reference: referenceEl,
				floating: floatingEl
			}), [referenceEl, floatingEl]);
			const floatingStyles = react.useMemo(() => {
				const initialStyles = {
					position: strategy,
					left: 0,
					top: 0
				};
				if (!elements.floating) return initialStyles;
				const x = roundByDPR(elements.floating, data.x);
				const y = roundByDPR(elements.floating, data.y);
				if (transform) return {
					...initialStyles,
					transform: "translate(" + x + "px, " + y + "px)",
					...getDPR(elements.floating) >= 1.5 && { willChange: "transform" }
				};
				return {
					position: strategy,
					left: x,
					top: y
				};
			}, [
				strategy,
				transform,
				elements.floating,
				data.x,
				data.y
			]);
			return react.useMemo(() => ({
				...data,
				update,
				refs,
				elements,
				floatingStyles
			}), [
				data,
				update,
				refs,
				elements,
				floatingStyles
			]);
		}
		/**
		* Modifies the placement by translating the floating element along the
		* specified axes.
		* A number (shorthand for `mainAxis` or distance), or an axes configuration
		* object may be passed.
		* @see https://floating-ui.com/docs/offset
		*/
		const offset = (options, deps) => {
			const result = offset$1(options);
			return {
				name: result.name,
				fn: result.fn,
				options: [options, deps]
			};
		};
		/**
		* Optimizes the visibility of the floating element by shifting it in order to
		* keep it in view when it will overflow the clipping boundary.
		* @see https://floating-ui.com/docs/shift
		*/
		const shift = (options, deps) => {
			const result = shift$1(options);
			return {
				name: result.name,
				fn: result.fn,
				options: [options, deps]
			};
		};
		/**
		* Built-in `limiter` that will stop `shift()` at a certain point.
		*/
		const limitShift = (options, deps) => {
			return {
				fn: limitShift$1(options).fn,
				options: [options, deps]
			};
		};
		/**
		* Optimizes the visibility of the floating element by flipping the `placement`
		* in order to keep it in view when the preferred placement(s) will overflow the
		* clipping boundary. Alternative to `autoPlacement`.
		* @see https://floating-ui.com/docs/flip
		*/
		const flip = (options, deps) => {
			const result = flip$1(options);
			return {
				name: result.name,
				fn: result.fn,
				options: [options, deps]
			};
		};
		/**
		* Provides data that allows you to change the size of the floating element —
		* for instance, prevent it from overflowing the clipping boundary or match the
		* width of the reference element.
		* @see https://floating-ui.com/docs/size
		*/
		const size = (options, deps) => {
			const result = size$1(options);
			return {
				name: result.name,
				fn: result.fn,
				options: [options, deps]
			};
		};
		//#endregion
		//#region node_modules/.pnpm/@base-ui+react@1.9.0_@date-fns+tz@1.5.0_@types+react@18.3.31_date-fns@4.4.0_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/react/tooltip/store/TooltipStore.mjs
		const selectors$1 = {
			...popupStoreSelectors,
			disabled: (state) => state.disabled,
			instantType: (state) => state.instantType,
			isInstantPhase: (state) => state.isInstantPhase,
			trackCursorAxis: (state) => state.trackCursorAxis,
			disableHoverablePopup: (state) => state.disableHoverablePopup,
			lastOpenChangeReason: (state) => state.openChangeReason,
			closeOnClick: (state) => state.closeOnClick,
			appliedTriggerProps: (state, apply) => apply ? state.activeTriggerProps : void 0,
			closeDelay: (state) => state.closeDelay,
			adaptiveOrigin: (state) => state.adaptiveOrigin
		};
		/**
		* The store view that detached handle-backed triggers read from. Both the real `TooltipStore` and
		* the inert fallback store satisfy it, so a trigger can read from whichever store the handle
		* currently exposes. Narrowed to the members a trigger actually uses — the trigger-data members plus
		* `setOpen`/`cancelPendingOpen` (called directly by the trigger) and `useSyncedValue` — so the
		* exposed surface can't bypass the open-change pipeline; on the detached fallback store every one of
		* these mutations is a no-op.
		*/
		var TooltipStore = class extends ReactStore {
			constructor(initialState, floatingId, nested) {
				const triggerElements = new PopupTriggerMap();
				super(createInitialState$1(initialState, triggerElements, floatingId, nested), createInitialContext$1(triggerElements), selectors$1);
			}
			setOpen = (nextOpen, eventDetails) => {
				applyPopupOpenChange(this, nextOpen, eventDetails, { extraState: { openChangeReason: eventDetails.reason } });
			};
			cancelPendingOpen(event) {
				this.state.floatingRootContext.dispatchOpenChange(false, createChangeEventDetails(triggerPress, event));
			}
		};
		function createInitialState$1(initialState, triggerElements, floatingId, nested = false) {
			return {
				...createInitialPopupStoreState(triggerElements, floatingId, nested),
				disabled: false,
				instantType: void 0,
				isInstantPhase: false,
				trackCursorAxis: "none",
				disableHoverablePopup: false,
				openChangeReason: null,
				closeOnClick: true,
				closeDelay: 0,
				adaptiveOrigin: void 0,
				...initialState
			};
		}
		function createInitialContext$1(triggerElements) {
			return {
				popupRef: /*#__PURE__*/ react.createRef(),
				onOpenChange: void 0,
				onOpenChangeComplete: void 0,
				triggerElements
			};
		}
		//#endregion
		//#region node_modules/.pnpm/@base-ui+react@1.9.0_@date-fns+tz@1.5.0_@types+react@18.3.31_date-fns@4.4.0_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/react/tooltip/root/TooltipRoot.mjs
		/**
		* Groups all parts of the tooltip.
		* Doesn't render its own HTML element.
		*
		* Documentation: [Base UI Tooltip](https://base-ui.com/react/components/tooltip)
		*/
		const TooltipRoot = fastComponent(function TooltipRoot(props) {
			const { disabled: disabled$1 = false, defaultOpen = false, open: openProp, disableHoverablePopup = false, trackCursorAxis = "none", actionsRef, onOpenChange, onOpenChangeComplete, handle, triggerId: triggerIdProp, defaultTriggerId: defaultTriggerIdProp = null, children } = props;
			const store = usePopupRootStore((floatingId, nested) => new TooltipStore({
				open: defaultOpen,
				openProp,
				activeTriggerId: defaultTriggerIdProp,
				triggerIdProp
			}, floatingId, nested));
			store.useControlledProp("openProp", openProp);
			store.useControlledProp("triggerIdProp", triggerIdProp);
			store.useContextCallback("onOpenChange", onOpenChange);
			store.useContextCallback("onOpenChangeComplete", onOpenChangeComplete);
			const openState = store.useState("open");
			const open = !disabled$1 && openState;
			const activeTriggerId = store.useState("activeTriggerId");
			const mounted = store.useState("mounted");
			const payload = store.useState("payload");
			store.useSyncedValues({
				trackCursorAxis,
				disableHoverablePopup,
				disabled: disabled$1
			});
			useImplicitActiveTrigger(store, { closeOnActiveTriggerUnmount: true });
			const { forceUnmount, transitionStatus } = useOpenStateTransitions(open, store);
			const isInstantPhase = store.useState("isInstantPhase");
			const instantType = store.useState("instantType");
			const lastOpenChangeReason = store.useState("lastOpenChangeReason");
			const previousInstantTypeRef = react.useRef(null);
			useIsoLayoutEffect(() => {
				if (openState && disabled$1) store.setOpen(false, createChangeEventDetails(disabled));
			}, [
				openState,
				disabled$1,
				store
			]);
			useIsoLayoutEffect(() => {
				if (transitionStatus === "ending" && lastOpenChangeReason === "none" || transitionStatus !== "ending" && isInstantPhase) {
					if (instantType !== "delay") previousInstantTypeRef.current = instantType;
					store.set("instantType", "delay");
				} else if (previousInstantTypeRef.current !== null) {
					store.set("instantType", previousInstantTypeRef.current);
					previousInstantTypeRef.current = null;
				}
			}, [
				transitionStatus,
				isInstantPhase,
				lastOpenChangeReason,
				instantType,
				store
			]);
			useIsoLayoutEffect(() => {
				if (open) {
					if (activeTriggerId == null) store.set("payload", void 0);
				}
			}, [
				store,
				activeTriggerId,
				open
			]);
			react.useImperativeHandle(actionsRef, () => ({
				unmount: forceUnmount,
				close: () => store.setOpen(false, createChangeEventDetails(imperativeAction))
			}), [forceUnmount, store]);
			const shouldRenderInteractions = open || mounted || !disabled$1 && trackCursorAxis !== "none";
			return /*#__PURE__*/ (0, react_jsx_runtime.jsxs)(TooltipRootContext.Provider, {
				value: store,
				children: [
					handle && /*#__PURE__*/ (0, react_jsx_runtime.jsx)(PopupHandleAttachment, {
						handle,
						store
					}),
					shouldRenderInteractions && /*#__PURE__*/ (0, react_jsx_runtime.jsx)(TooltipInteractions, {
						store,
						disabled: disabled$1,
						trackCursorAxis
					}),
					typeof children === "function" ? children({ payload }) : children
				]
			});
		});
		function TooltipInteractions({ store, disabled, trackCursorAxis }) {
			const floatingRootContext = store.useState("floatingRootContext");
			const dismiss = useDismiss(floatingRootContext, {
				enabled: !disabled,
				referencePress: () => store.select("closeOnClick")
			});
			const clientPoint = useClientPoint(floatingRootContext, {
				enabled: !disabled && trackCursorAxis !== "none",
				axis: trackCursorAxis === "none" ? void 0 : trackCursorAxis
			});
			const triggerProps = react.useMemo(() => mergeProps(clientPoint.reference, dismiss.reference), [clientPoint.reference, dismiss.reference]);
			usePopupInteractionProps(store, {
				activeTriggerProps: triggerProps,
				inactiveTriggerProps: triggerProps,
				popupProps: dismiss.floating ?? EMPTY_OBJECT
			});
			return null;
		}
		//#endregion
		//#region node_modules/.pnpm/@base-ui+react@1.9.0_@date-fns+tz@1.5.0_@types+react@18.3.31_date-fns@4.4.0_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/react/internals/useBaseUiId.mjs
		/**
		* Wraps `useId` and prefixes generated `id`s with `base-ui-`
		* @param {string | undefined} idOverride overrides the generated id when provided
		* @returns {string | undefined}
		*/
		function useBaseUiId(idOverride) {
			return useId$6(idOverride, "base-ui");
		}
		//#endregion
		//#region node_modules/.pnpm/@base-ui+react@1.9.0_@date-fns+tz@1.5.0_@types+react@18.3.31_date-fns@4.4.0_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/react/tooltip/provider/TooltipProviderContext.mjs
		/**
		* Holds the provider's `delay` value. `closeDelay` is handled by the delay group.
		*/
		const TooltipProviderContext = /*#__PURE__*/ react.createContext(void 0);
		function useTooltipProviderContext() {
			return react.useContext(TooltipProviderContext);
		}
		//#endregion
		//#region node_modules/.pnpm/@base-ui+react@1.9.0_@date-fns+tz@1.5.0_@types+react@18.3.31_date-fns@4.4.0_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/react/tooltip/trigger/TooltipTrigger.mjs
		const TOOLTIP_TRIGGER_IDENTIFIER = "data-base-ui-tooltip-trigger";
		function getTargetElement(event) {
			const target = getTarget(event);
			return isElement(target) ? target : null;
		}
		/**
		* An element to attach the tooltip to.
		* Renders a `<button>` element.
		*
		* Documentation: [Base UI Tooltip](https://base-ui.com/react/components/tooltip)
		*/
		const TooltipTrigger = fastComponentRef(function TooltipTrigger(componentProps, forwardedRef) {
			const { render, className, style, handle, payload, disabled: disabledProp, delay, closeOnClick = true, closeDelay, id: idProp, ...elementProps } = componentProps;
			const rootContext = useTooltipRootContext(true);
			const store = usePopupHandleStore(handle) ?? rootContext;
			if (!store) throw new Error(formatErrorMessage(82));
			const thisTriggerId = useBaseUiId(idProp);
			const isTriggerActive = store.useState("isTriggerActive", thisTriggerId);
			const isOpenedByThisTrigger = store.useState("isOpenedByTrigger", thisTriggerId);
			const floatingRootContext = store.useState("floatingRootContext");
			const triggerElementRef = react.useRef(null);
			const closeDelayWithDefault = closeDelay ?? 0;
			const { registerTrigger, isMountedByThisTrigger } = useTriggerDataForwarding(thisTriggerId, triggerElementRef, store, {
				payload,
				closeOnClick,
				closeDelay: closeDelayWithDefault
			});
			const providerDelay = useTooltipProviderContext();
			const { activeIdRef, delayRef, isInstantPhase, hasProvider } = useDelayGroup(floatingRootContext, { open: isOpenedByThisTrigger });
			const hoverInteraction = useHoverInteractionSharedState(floatingRootContext);
			store.useSyncedValue("isInstantPhase", isInstantPhase);
			const rootDisabled = store.useState("disabled");
			const disabled = disabledProp ?? rootDisabled;
			const disabledRef = useValueAsRef(disabled);
			const trackCursorAxis = store.useState("trackCursorAxis");
			const disableHoverablePopup = store.useState("disableHoverablePopup");
			const isNestedTriggerHoveredRef = react.useRef(false);
			const nestedTriggerOpenTimeout = useTimeout();
			const pointerTypeRef = react.useRef(void 0);
			function getOpenDelay() {
				if (hasProvider && activeIdRef.current != null) return 0;
				return delay ?? providerDelay ?? 600;
			}
			function isEnabledNestedTriggerTarget(target) {
				const triggerEl = triggerElementRef.current;
				if (!triggerEl || !target) return false;
				const nearestTrigger = closest(target, `[${TOOLTIP_TRIGGER_IDENTIFIER}]`);
				return nearestTrigger !== null && nearestTrigger !== triggerEl && contains(triggerEl, nearestTrigger);
			}
			function detectNestedTriggerHover(target) {
				const nestedTriggerHovered = isEnabledNestedTriggerTarget(target);
				isNestedTriggerHoveredRef.current = nestedTriggerHovered;
				if (nestedTriggerHovered) {
					hoverInteraction.openChangeTimeout.clear();
					hoverInteraction.restTimeout.clear();
					hoverInteraction.restTimeoutPending = false;
					nestedTriggerOpenTimeout.clear();
				}
				return nestedTriggerHovered;
			}
			const hoverProps = useHoverReferenceInteraction(floatingRootContext, {
				enabled: !disabled,
				mouseOnly: true,
				move: false,
				handleClose: !disableHoverablePopup && trackCursorAxis !== "both" ? safePolygon() : null,
				restMs: getOpenDelay,
				delay() {
					if (closeDelay == null && hasProvider) return { close: getDelay(delayRef.current, "close") };
					return { close: closeDelayWithDefault };
				},
				triggerElementRef,
				isActiveTrigger: isTriggerActive,
				isClosing: () => store.select("transitionStatus") === "ending",
				shouldOpen() {
					return !isNestedTriggerHoveredRef.current;
				}
			});
			const focusProps = useFocus(floatingRootContext, { enabled: !disabled }).reference;
			const handleNestedTriggerHover = (event) => {
				const wasNestedTriggerHovered = isNestedTriggerHoveredRef.current;
				const target = getTargetElement(event);
				const nestedTriggerHovered = detectNestedTriggerHover(target);
				const triggerEl = triggerElementRef.current;
				const targetInsideTrigger = triggerEl && target && contains(triggerEl, target);
				if (nestedTriggerHovered && store.select("open") && store.select("lastOpenChangeReason") === "trigger-hover") {
					store.setOpen(false, createChangeEventDetails(triggerHover, event));
					return;
				}
				if (wasNestedTriggerHovered && !nestedTriggerHovered && targetInsideTrigger && !disabledRef.current && !store.select("open") && triggerEl && isMouseLikePointerType(pointerTypeRef.current)) {
					const open = () => {
						if (!isNestedTriggerHoveredRef.current && !disabledRef.current && !store.select("open")) store.setOpen(true, createChangeEventDetails(triggerHover, event, triggerEl));
					};
					const openDelay = getOpenDelay();
					if (openDelay === 0) {
						nestedTriggerOpenTimeout.clear();
						open();
					} else nestedTriggerOpenTimeout.start(openDelay, open);
				}
			};
			const rootTriggerProps = store.useState("appliedTriggerProps", isMountedByThisTrigger || trackCursorAxis !== "none");
			return useRenderElement("button", componentProps, {
				state: { open: isOpenedByThisTrigger },
				ref: [
					forwardedRef,
					registerTrigger,
					triggerElementRef
				],
				props: [
					hoverProps,
					focusProps,
					rootTriggerProps,
					{
						onMouseOver(event) {
							handleNestedTriggerHover(event.nativeEvent);
						},
						onFocus(event) {
							if (isEnabledNestedTriggerTarget(getTargetElement(event.nativeEvent))) event.preventBaseUIHandler();
						},
						onMouseLeave() {
							isNestedTriggerHoveredRef.current = false;
							nestedTriggerOpenTimeout.clear();
							pointerTypeRef.current = void 0;
						},
						onPointerEnter(event) {
							pointerTypeRef.current = event.pointerType;
						},
						onPointerDown(event) {
							pointerTypeRef.current = event.pointerType;
							store.set("closeOnClick", closeOnClick);
							if (closeOnClick && !store.select("open")) store.cancelPendingOpen(event.nativeEvent);
						},
						onClick(event) {
							if (closeOnClick && !store.select("open")) store.cancelPendingOpen(event.nativeEvent);
						},
						id: thisTriggerId,
						[triggerDisabled]: disabled ? "" : void 0,
						[TOOLTIP_TRIGGER_IDENTIFIER]: disabled ? void 0 : ""
					},
					elementProps
				],
				stateAttributesMapping: triggerOpenStateMapping
			});
		});
		//#endregion
		//#region node_modules/.pnpm/@base-ui+react@1.9.0_@date-fns+tz@1.5.0_@types+react@18.3.31_date-fns@4.4.0_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/react/tooltip/portal/TooltipPortalContext.mjs
		const TooltipPortalContext = /*#__PURE__*/ react.createContext(void 0);
		function useTooltipPortalContext() {
			const value = react.useContext(TooltipPortalContext);
			if (value === void 0) throw new Error(formatErrorMessage(70));
			return value;
		}
		//#endregion
		//#region node_modules/.pnpm/@base-ui+react@1.9.0_@date-fns+tz@1.5.0_@types+react@18.3.31_date-fns@4.4.0_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/react/utils/FloatingPortalLite.mjs
		/**
		* `FloatingPortal` includes tabbable logic handling for focus management.
		* For components that don't need tabbable logic, use `FloatingPortalLite`.
		* @internal
		*/
		const FloatingPortalLite = /*#__PURE__*/ react.forwardRef(function FloatingPortalLite(componentProps, forwardedRef) {
			const { children, container, className, render, style, ...elementProps } = componentProps;
			const { node: portalNode, subtree: portalSubtree } = useFloatingPortalNode({
				container,
				ref: forwardedRef,
				componentProps,
				elementProps
			});
			if (!portalSubtree && !portalNode) return null;
			return /*#__PURE__*/ (0, react_jsx_runtime.jsxs)(react.Fragment, { children: [portalSubtree, portalNode && /*#__PURE__*/ react_dom.createPortal(children, portalNode)] });
		});
		//#endregion
		//#region node_modules/.pnpm/@base-ui+react@1.9.0_@date-fns+tz@1.5.0_@types+react@18.3.31_date-fns@4.4.0_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/react/tooltip/portal/TooltipPortal.mjs
		/**
		* A portal element that moves the popup to a different part of the DOM.
		* By default, the portal element is appended to `<body>`.
		* Renders a `<div>` element.
		*
		* Documentation: [Base UI Tooltip](https://base-ui.com/react/components/tooltip)
		*/
		const TooltipPortal = /*#__PURE__*/ react.forwardRef(function TooltipPortal(props, forwardedRef) {
			const { keepMounted = false, ...portalProps } = props;
			if (!(useTooltipRootContext().useState("mounted") || keepMounted)) return null;
			return /*#__PURE__*/ (0, react_jsx_runtime.jsx)(TooltipPortalContext.Provider, {
				value: keepMounted,
				children: /*#__PURE__*/ (0, react_jsx_runtime.jsx)(FloatingPortalLite, {
					ref: forwardedRef,
					...portalProps
				})
			});
		});
		//#endregion
		//#region node_modules/.pnpm/@base-ui+react@1.9.0_@date-fns+tz@1.5.0_@types+react@18.3.31_date-fns@4.4.0_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/react/tooltip/positioner/TooltipPositionerContext.mjs
		const TooltipPositionerContext = /*#__PURE__*/ react.createContext(void 0);
		function useTooltipPositionerContext() {
			const context = react.useContext(TooltipPositionerContext);
			if (context === void 0) throw new Error(formatErrorMessage(71));
			return context;
		}
		//#endregion
		//#region node_modules/.pnpm/@base-ui+react@1.9.0_@date-fns+tz@1.5.0_@types+react@18.3.31_date-fns@4.4.0_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/react/floating-ui-react/hooks/useFloating.mjs
		/**
		* Provides data to position a floating element and context to add interactions.
		* The caller supplies the root store, which owns the reference and floating elements.
		* @see https://floating-ui.com/docs/useFloating
		*/
		function useBaseUIFloating(options) {
			const { nodeId, externalTree, rootContext: store } = options;
			const referenceElement = store.useState("referenceElement");
			const floatingElement = store.useState("floatingElement");
			const domReferenceElement = store.useState("domReferenceElement");
			const open = store.useState("open");
			const floatingId = store.useState("floatingId");
			const [positionReference, setPositionReferenceRaw] = react.useState(null);
			const domReferenceRef = react.useRef(null);
			const tree = useFloatingTree(externalTree);
			const storeElements = react.useMemo(() => ({
				reference: referenceElement,
				floating: floatingElement,
				domReference: domReferenceElement
			}), [
				referenceElement,
				floatingElement,
				domReferenceElement
			]);
			const position = useFloating({
				...options,
				elements: {
					...storeElements,
					...positionReference && { reference: positionReference }
				}
			});
			const setPositionReference = react.useCallback((node) => {
				const computedPositionReference = isElement(node) ? {
					getBoundingClientRect: () => node.getBoundingClientRect(),
					getClientRects: () => node.getClientRects(),
					contextElement: node
				} : node;
				setPositionReferenceRaw(computedPositionReference);
				position.refs.setReference(computedPositionReference);
			}, [position.refs]);
			const refs = react.useMemo(() => ({
				...position.refs,
				setPositionReference,
				domReference: domReferenceRef
			}), [position.refs, setPositionReference]);
			const elements = react.useMemo(() => ({
				...position.elements,
				domReference: domReferenceElement
			}), [position.elements, domReferenceElement]);
			const context = react.useMemo(() => ({
				...position,
				dataRef: store.context.dataRef,
				open,
				onOpenChange: store.setOpen,
				events: store.context.events,
				floatingId,
				refs,
				elements,
				nodeId,
				rootStore: store
			}), [
				position,
				refs,
				elements,
				nodeId,
				store,
				open,
				floatingId
			]);
			useIsoLayoutEffect(() => {
				if (domReferenceElement) domReferenceRef.current = domReferenceElement;
			}, [domReferenceElement]);
			useIsoLayoutEffect(() => {
				store.context.dataRef.current.floatingContext = context;
				const node = tree?.nodesRef.current.find((n) => n.id === nodeId);
				if (node) node.context = context;
			});
			return react.useMemo(() => ({
				...position,
				context,
				refs,
				elements,
				rootStore: store
			}), [
				position,
				refs,
				elements,
				context,
				store
			]);
		}
		//#endregion
		//#region node_modules/.pnpm/@base-ui+react@1.9.0_@date-fns+tz@1.5.0_@types+react@18.3.31_date-fns@4.4.0_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/react/internals/direction-context/DirectionContext.mjs
		const DirectionContext = /*#__PURE__*/ react.createContext(void 0);
		function useDirection() {
			return react.useContext(DirectionContext)?.direction ?? "ltr";
		}
		//#endregion
		//#region node_modules/.pnpm/@base-ui+react@1.9.0_@date-fns+tz@1.5.0_@types+react@18.3.31_date-fns@4.4.0_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/react/floating-ui-react/middleware/arrow.mjs
		/**
		* Fork of the original `arrow` middleware from Floating UI that always uses the floating element
		* as the arrow's offset parent.
		*/
		const baseArrow = (options) => ({
			name: "arrow",
			options,
			async fn(state) {
				const { x, y, placement, rects, platform, elements, middlewareData } = state;
				const { element, padding = 0 } = evaluate(options, state) || {};
				if (element == null) return {};
				const paddingObject = getPaddingObject(padding);
				const coords = {
					x,
					y
				};
				const axis = getAlignmentAxis(placement);
				const length = getAxisLength(axis);
				const arrowDimensions = await platform.getDimensions(element);
				const isYAxis = axis === "y";
				const minProp = isYAxis ? "top" : "left";
				const maxProp = isYAxis ? "bottom" : "right";
				const clientProp = isYAxis ? "clientHeight" : "clientWidth";
				const endDiff = rects.reference[length] + rects.reference[axis] - coords[axis] - rects.floating[length];
				const startDiff = coords[axis] - rects.reference[axis];
				const clientSize = elements.floating[clientProp] || rects.floating[length];
				const centerToReference = endDiff / 2 - startDiff / 2;
				const largestPossiblePadding = clientSize / 2 - arrowDimensions[length] / 2 - 1;
				const minPadding = Math.min(paddingObject[minProp], largestPossiblePadding);
				const maxPadding = Math.min(paddingObject[maxProp], largestPossiblePadding);
				const min = minPadding;
				const max = clientSize - arrowDimensions[length] - maxPadding;
				const center = clientSize / 2 - arrowDimensions[length] / 2 + centerToReference;
				const offset = clamp(min, center, max);
				const shouldAddOffset = !middlewareData.arrow && getAlignment(placement) != null && center !== offset && rects.reference[length] / 2 - (center < min ? minPadding : maxPadding) - arrowDimensions[length] / 2 < 0;
				const alignmentOffset = shouldAddOffset ? center < min ? center - min : center - max : 0;
				return {
					[axis]: coords[axis] + alignmentOffset,
					data: {
						[axis]: offset,
						centerOffset: center - offset - alignmentOffset,
						...shouldAddOffset && { alignmentOffset }
					},
					reset: shouldAddOffset
				};
			}
		});
		/**
		* Provides data to position an inner element of the floating element so that it
		* appears centered to the reference element.
		* This wraps the core `arrow` middleware to allow React refs as the element.
		* @see https://floating-ui.com/docs/arrow
		*/
		const arrow = (options, deps) => {
			const { name, fn } = baseArrow(options);
			return {
				name,
				fn,
				options: [options, deps]
			};
		};
		//#endregion
		//#region node_modules/.pnpm/@base-ui+react@1.9.0_@date-fns+tz@1.5.0_@types+react@18.3.31_date-fns@4.4.0_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/react/utils/hideMiddleware.mjs
		const hide = {
			name: "hide",
			async fn(state) {
				const { width, height, x, y } = state.rects.reference;
				const anchorHidden = width === 0 && height === 0 && x === 0 && y === 0;
				const overflow = await state.platform.detectOverflow(state, { elementContext: "reference" });
				return { data: { referenceHidden: overflow.top - height >= 0 || overflow.right - width >= 0 || overflow.bottom - height >= 0 || overflow.left - width >= 0 || anchorHidden } };
			}
		};
		//#endregion
		//#region node_modules/.pnpm/@base-ui+react@1.9.0_@date-fns+tz@1.5.0_@types+react@18.3.31_date-fns@4.4.0_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/react/utils/adaptiveOriginConstants.mjs
		const DEFAULT_SIDES = {
			sideX: "left",
			sideY: "top"
		};
		//#endregion
		//#region node_modules/.pnpm/@base-ui+react@1.9.0_@date-fns+tz@1.5.0_@types+react@18.3.31_date-fns@4.4.0_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/react/utils/CommonPositionerCssVars.mjs
		/**
		* The available width between the trigger and the edge of the viewport.
		* @type {number}
		*/
		const availableWidth = "--available-width";
		/**
		* The available height between the trigger and the edge of the viewport.
		* @type {number}
		*/
		const availableHeight = "--available-height";
		/**
		* The anchor's width.
		* @type {number}
		*/
		const anchorWidth = "--anchor-width";
		/**
		* The anchor's height.
		* @type {number}
		*/
		const anchorHeight = "--anchor-height";
		/**
		* The coordinates that this element is anchored to. Used for animations and transitions.
		* @type {string}
		*/
		const transformOrigin = "--transform-origin";
		//#endregion
		//#region node_modules/.pnpm/@base-ui+react@1.9.0_@date-fns+tz@1.5.0_@types+react@18.3.31_date-fns@4.4.0_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/react/internals/useAnchorPositioning.mjs
		const AVAILABLE_WIDTH_VAR = availableWidth;
		const AVAILABLE_HEIGHT_VAR = availableHeight;
		function getLogicalSide(sideParam, renderedSide, isRtl) {
			const isLogicalSideParam = sideParam === "inline-start" || sideParam === "inline-end";
			return {
				top: "top",
				right: isLogicalSideParam ? isRtl ? "inline-start" : "inline-end" : "right",
				bottom: "bottom",
				left: isLogicalSideParam ? isRtl ? "inline-end" : "inline-start" : "left"
			}[renderedSide];
		}
		function getOffsetData(state, sideParam, isRtl) {
			const { rects, placement } = state;
			return {
				side: getLogicalSide(sideParam, getSide(placement), isRtl),
				align: getAlignment(placement) || "center",
				anchor: {
					width: rects.reference.width,
					height: rects.reference.height
				},
				positioner: {
					width: rects.floating.width,
					height: rects.floating.height
				}
			};
		}
		/**
		* Provides standardized anchor positioning behavior for floating elements. Wraps Floating UI's
		* `useFloating` hook.
		*/
		function useAnchorPositioning(params) {
			return useAnchorPositioningWithHook(params, useBaseUIFloating);
		}
		function useAnchorPositioningWithHook(params, useFloatingHook) {
			const { anchor, positionMethod = "absolute", side: sideParam = "bottom", sideOffset = 0, align = "center", alignOffset = 0, collisionBoundary, collisionPadding: collisionPaddingParam = 5, sticky = false, arrowPadding = 5, disableAnchorTracking = false, inline: inlineMiddleware, keepMounted = false, floatingRootContext, mounted, collisionAvoidance, shift: shift$3, nodeId, adaptiveOrigin, lazyFlip = false, externalTree } = params;
			const collisionAvoidanceSide = collisionAvoidance.side || "flip";
			const collisionAvoidanceAlign = collisionAvoidance.align || "flip";
			const collisionAvoidanceFallbackAxisSide = collisionAvoidance.fallbackAxisSide || "end";
			const shiftCrossAxis = shift$3?.crossAxis ?? false;
			const shiftRootBoundary = shift$3?.rootBoundary;
			const anchorFn = typeof anchor === "function" ? anchor : void 0;
			const anchorFnCallback = useStableCallback(anchorFn);
			const anchorDep = anchorFn ? anchorFnCallback : anchor;
			const anchorValueRef = useValueAsRef(anchor);
			const mountedRef = useValueAsRef(mounted);
			const isRtl = useDirection() === "rtl";
			const [mountPlacement, setMountPlacement] = react.useState(null);
			if (!mounted && mountPlacement !== null) setMountPlacement(null);
			const lockAlign = lazyFlip === "placement";
			const mountSide = mountPlacement ? getSide(mountPlacement) : null;
			const mountAlign = mountPlacement && lockAlign ? getAlignment(mountPlacement) || "center" : null;
			const side = mountSide || {
				top: "top",
				right: "right",
				bottom: "bottom",
				left: "left",
				"inline-end": isRtl ? "left" : "right",
				"inline-start": isRtl ? "right" : "left"
			}[sideParam];
			const placementAlign = mountAlign || align;
			const placement = placementAlign === "center" ? side : `${side}-${placementAlign}`;
			let collisionPadding = collisionPaddingParam;
			if (typeof collisionPadding === "number") collisionPadding = {
				top: collisionPadding,
				right: collisionPadding,
				bottom: collisionPadding,
				left: collisionPadding
			};
			else if (collisionPadding) collisionPadding = {
				top: collisionPadding.top || 0,
				right: collisionPadding.right || 0,
				bottom: collisionPadding.bottom || 0,
				left: collisionPadding.left || 0
			};
			const bias = 1;
			const biasTop = sideParam === "bottom" ? bias : 0;
			const biasBottom = sideParam === "top" ? bias : 0;
			const biasLeft = sideParam === "right" ? bias : 0;
			const biasRight = sideParam === "left" ? bias : 0;
			const commonCollisionProps = {
				boundary: collisionBoundary === "clipping-ancestors" ? "clippingAncestors" : collisionBoundary,
				padding: collisionPadding
			};
			const arrowRef = react.useRef(null);
			const sideOffsetRef = useValueAsRef(sideOffset);
			const alignOffsetRef = useValueAsRef(alignOffset);
			const sideOffsetDep = typeof sideOffset !== "function" ? sideOffset : 0;
			const alignOffsetDep = typeof alignOffset !== "function" ? alignOffset : 0;
			const middleware = [];
			if (inlineMiddleware) middleware.push(inlineMiddleware);
			middleware.push(offset((state) => {
				const data = getOffsetData(state, sideParam, isRtl);
				const sideAxis = typeof sideOffsetRef.current === "function" ? sideOffsetRef.current(data) : sideOffsetRef.current;
				const alignAxis = typeof alignOffsetRef.current === "function" ? alignOffsetRef.current(data) : alignOffsetRef.current;
				return {
					mainAxis: sideAxis,
					crossAxis: alignAxis,
					alignmentAxis: alignAxis
				};
			}, [
				sideOffsetDep,
				alignOffsetDep,
				isRtl,
				sideParam
			]));
			const shiftDisabled = collisionAvoidanceAlign === "none" && collisionAvoidanceSide !== "shift";
			const crossAxisShiftEnabled = !shiftDisabled && (sticky || shiftCrossAxis || collisionAvoidanceSide === "shift");
			const flipMiddleware = collisionAvoidanceSide === "none" ? null : flip({
				...commonCollisionProps,
				padding: {
					top: collisionPadding.top + bias + biasTop,
					right: collisionPadding.right + bias + biasRight,
					bottom: collisionPadding.bottom + bias + biasBottom,
					left: collisionPadding.left + bias + biasLeft
				},
				mainAxis: !shiftCrossAxis && collisionAvoidanceSide === "flip",
				crossAxis: collisionAvoidanceAlign === "flip" ? "alignment" : false,
				fallbackAxisSideDirection: collisionAvoidanceFallbackAxisSide
			});
			const shiftMiddleware = shiftDisabled ? null : shift({
				...commonCollisionProps,
				rootBoundary: shiftRootBoundary,
				mainAxis: collisionAvoidanceAlign !== "none",
				crossAxis: crossAxisShiftEnabled,
				limiter: sticky || shiftCrossAxis ? void 0 : limitShift((limitData) => {
					if (!arrowRef.current) return {};
					const { width, height } = arrowRef.current.getBoundingClientRect();
					const sideAxis = getSideAxis(getSide(limitData.placement));
					const arrowSize = sideAxis === "y" ? width : height;
					const offsetAmount = sideAxis === "y" ? collisionPadding.left + collisionPadding.right : collisionPadding.top + collisionPadding.bottom;
					return { offset: arrowSize / 2 + offsetAmount / 2 };
				})
			}, [
				commonCollisionProps,
				sticky,
				shiftCrossAxis,
				shiftRootBoundary,
				collisionPadding,
				collisionAvoidanceAlign
			]);
			if (collisionAvoidanceSide === "shift" || collisionAvoidanceAlign === "shift" || placementAlign === "center") middleware.push(shiftMiddleware, flipMiddleware);
			else middleware.push(flipMiddleware, shiftMiddleware);
			middleware.push(size({
				...commonCollisionProps,
				apply({ elements: { floating }, availableWidth, availableHeight, rects }) {
					if (!mountedRef.current) return;
					const floatingStyle = floating.style;
					floatingStyle.setProperty(AVAILABLE_WIDTH_VAR, `${availableWidth}px`);
					floatingStyle.setProperty(AVAILABLE_HEIGHT_VAR, `${availableHeight}px`);
					const dpr = getWindow(floating).devicePixelRatio || 1;
					const { x, y, width, height } = rects.reference;
					const anchorWidth$1 = (Math.round((x + width) * dpr) - Math.round(x * dpr)) / dpr;
					const anchorHeight$1 = (Math.round((y + height) * dpr) - Math.round(y * dpr)) / dpr;
					floatingStyle.setProperty(anchorWidth, `${anchorWidth$1}px`);
					floatingStyle.setProperty(anchorHeight, `${anchorHeight$1}px`);
				}
			}), arrow((state) => ({
				element: arrowRef.current || ownerDocument(state.elements.floating).createElement("div"),
				padding: arrowRef.current ? arrowPadding : 0
			}), [arrowPadding]), {
				name: "transformOrigin",
				fn(state) {
					const { elements: { floating }, middlewareData, placement: renderedPlacement, platform, rects, y } = state;
					const renderedSide = getSide(renderedPlacement);
					const renderedAlign = getAlignment(renderedPlacement);
					const isVertical = getSideAxis(renderedSide) === "y";
					const arrowEl = arrowRef.current;
					const sideOffsetValue = typeof sideOffset === "function" ? sideOffset(getOffsetData(state, sideParam, isRtl)) : sideOffset;
					let crossOrigin;
					if (!arrowEl && renderedAlign && Math.abs(isVertical ? middlewareData.shift?.x || 0 : middlewareData.shift?.y || 0) <= 1) crossOrigin = renderedAlign === "start" === (isVertical && platform.isRTL?.(floating) === true) ? "100%" : "0%";
					else crossOrigin = `${(isVertical ? middlewareData.arrow?.x || 0 : middlewareData.arrow?.y || 0) + (isVertical ? arrowEl?.clientWidth || 0 : arrowEl?.clientHeight || 0) / 2}px`;
					let sideOrigin = renderedSide === "top" || renderedSide === "left" ? `calc(100% + ${sideOffsetValue}px)` : `${-sideOffsetValue}px`;
					if (crossAxisShiftEnabled && isVertical && Math.abs(middlewareData.shift?.y || 0) > sideOffsetValue) sideOrigin = `${rects.reference.y + rects.reference.height / 2 - y}px`;
					floating.style.setProperty(transformOrigin, isVertical ? `${crossOrigin} ${sideOrigin}` : `${sideOrigin} ${crossOrigin}`);
					return {};
				}
			}, hide, adaptiveOrigin);
			useIsoLayoutEffect(() => {
				if (!mounted && floatingRootContext) floatingRootContext.update({
					referenceElement: null,
					floatingElement: null,
					domReferenceElement: null,
					positionReference: null
				});
			}, [mounted, floatingRootContext]);
			const autoUpdateOptions = react.useMemo(() => ({
				ancestorScroll: !disableAnchorTracking,
				elementResize: !disableAnchorTracking && typeof ResizeObserver !== "undefined",
				layoutShift: !disableAnchorTracking && typeof IntersectionObserver !== "undefined"
			}), [disableAnchorTracking]);
			const { refs, elements, x, y, middlewareData, update, placement: renderedPlacement, context, isPositioned, floatingStyles: originalFloatingStyles } = useFloatingHook({
				rootContext: floatingRootContext,
				open: keepMounted ? mounted : void 0,
				placement,
				middleware,
				strategy: positionMethod,
				whileElementsMounted: keepMounted ? void 0 : (...args) => autoUpdate(...args, autoUpdateOptions),
				nodeId,
				externalTree
			});
			const { sideX, sideY } = middlewareData.adaptiveOrigin || DEFAULT_SIDES;
			const resolvedPosition = isPositioned ? positionMethod : "fixed";
			const floatingStyles = react.useMemo(() => {
				let base;
				if (!isPositioned) base = {
					position: resolvedPosition,
					top: 0,
					left: 0
				};
				else if (adaptiveOrigin) base = {
					position: resolvedPosition,
					[sideX]: x,
					[sideY]: y
				};
				else base = {
					...originalFloatingStyles,
					position: resolvedPosition
				};
				base[AVAILABLE_WIDTH_VAR] = "100vw";
				base[AVAILABLE_HEIGHT_VAR] = "100vh";
				if (!isPositioned) base.opacity = 0;
				return base;
			}, [
				adaptiveOrigin,
				resolvedPosition,
				sideX,
				x,
				sideY,
				y,
				originalFloatingStyles,
				isPositioned
			]);
			const registeredPositionReferenceRef = react.useRef(null);
			useIsoLayoutEffect(() => {
				if (!mounted) return;
				const anchorValue = anchorValueRef.current;
				const resolvedAnchor = typeof anchorValue === "function" ? anchorValue() : anchorValue;
				const finalAnchor = (isRef(resolvedAnchor) ? resolvedAnchor.current : resolvedAnchor) || null;
				if (finalAnchor !== registeredPositionReferenceRef.current) {
					refs.setPositionReference(finalAnchor);
					registeredPositionReferenceRef.current = finalAnchor;
				}
			}, [
				mounted,
				refs,
				anchorDep,
				anchorValueRef
			]);
			react.useEffect(() => {
				if (!mounted) return;
				const anchorValue = anchorValueRef.current;
				if (typeof anchorValue === "function") return;
				if (isRef(anchorValue) && anchorValue.current !== registeredPositionReferenceRef.current) {
					refs.setPositionReference(anchorValue.current);
					registeredPositionReferenceRef.current = anchorValue.current;
				}
			}, [
				mounted,
				refs,
				anchorDep,
				anchorValueRef
			]);
			react.useEffect(() => {
				if (keepMounted && mounted && elements.reference && elements.floating) return autoUpdate(elements.reference, elements.floating, update, autoUpdateOptions);
			}, [
				keepMounted,
				mounted,
				elements,
				update,
				autoUpdateOptions
			]);
			const renderedSide = getSide(renderedPlacement);
			const logicalRenderedSide = getLogicalSide(sideParam, renderedSide, isRtl);
			const renderedAlign = getAlignment(renderedPlacement) || "center";
			const anchorHidden = Boolean(middlewareData.hide?.referenceHidden);
			useIsoLayoutEffect(() => {
				if (lazyFlip && mounted && isPositioned && (renderedSide !== side || lockAlign && renderedAlign !== placementAlign)) setMountPlacement(renderedPlacement);
			}, [
				lazyFlip,
				lockAlign,
				mounted,
				isPositioned,
				renderedPlacement,
				renderedSide,
				renderedAlign,
				side,
				placementAlign
			]);
			const arrowStyles = react.useMemo(() => ({
				position: "absolute",
				top: middlewareData.arrow?.y,
				left: middlewareData.arrow?.x
			}), [middlewareData.arrow]);
			const arrowUncentered = middlewareData.arrow?.centerOffset !== 0;
			return react.useMemo(() => ({
				positionerStyles: floatingStyles,
				arrowStyles,
				arrowRef,
				arrowUncentered,
				side: logicalRenderedSide,
				align: renderedAlign,
				physicalSide: renderedSide,
				anchorHidden,
				refs,
				context,
				isPositioned,
				update
			}), [
				floatingStyles,
				arrowStyles,
				arrowRef,
				arrowUncentered,
				logicalRenderedSide,
				renderedAlign,
				renderedSide,
				anchorHidden,
				refs,
				context,
				isPositioned,
				update
			]);
		}
		function isRef(param) {
			return param != null && "current" in param;
		}
		//#endregion
		//#region node_modules/.pnpm/@base-ui+react@1.9.0_@date-fns+tz@1.5.0_@types+react@18.3.31_date-fns@4.4.0_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/react/internals/getDisabledMountTransitionStyles.mjs
		function getDisabledMountTransitionStyles(transitionStatus) {
			return transitionStatus === "starting" ? DISABLED_TRANSITIONS_STYLE : EMPTY_OBJECT;
		}
		//#endregion
		//#region node_modules/.pnpm/@base-ui+react@1.9.0_@date-fns+tz@1.5.0_@types+react@18.3.31_date-fns@4.4.0_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/react/utils/usePositioner.mjs
		/**
		* Renders the shared outer Positioner element used by popup components.
		* Applies the common role, hidden state, transition styles, state attributes, and optional inert styling.
		*/
		function usePositioner(componentProps, state, { styles, transitionStatus, props, refs, hidden, inert = false }) {
			const style = { ...styles };
			if (inert) style.pointerEvents = "none";
			return useRenderElement("div", componentProps, {
				state,
				ref: refs,
				props: [
					{
						role: "presentation",
						hidden,
						style
					},
					getDisabledMountTransitionStyles(transitionStatus),
					props
				],
				stateAttributesMapping: popupStateMapping
			});
		}
		//#endregion
		//#region node_modules/.pnpm/@base-ui+react@1.9.0_@date-fns+tz@1.5.0_@types+react@18.3.31_date-fns@4.4.0_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/react/tooltip/positioner/TooltipPositioner.mjs
		/**
		* Positions the tooltip against the trigger.
		* Renders a `<div>` element.
		*
		* Documentation: [Base UI Tooltip](https://base-ui.com/react/components/tooltip)
		*/
		const TooltipPositioner = /*#__PURE__*/ react.forwardRef(function TooltipPositioner(componentProps, forwardedRef) {
			const { render, className, anchor, positionMethod = "absolute", side = "top", align = "center", sideOffset = 0, alignOffset = 0, collisionBoundary = "clipping-ancestors", collisionPadding = 5, arrowPadding = 5, sticky = false, disableAnchorTracking = false, collisionAvoidance = POPUP_COLLISION_AVOIDANCE, style, ...elementProps } = componentProps;
			const store = useTooltipRootContext();
			const keepMounted = useTooltipPortalContext();
			const open = store.useState("open");
			const mounted = store.useState("mounted");
			const trackCursorAxis = store.useState("trackCursorAxis");
			const disableHoverablePopup = store.useState("disableHoverablePopup");
			const floatingRootContext = store.useState("floatingRootContext");
			const instantType = store.useState("instantType");
			const transitionStatus = store.useState("transitionStatus");
			const positioning = useAnchorPositioning({
				anchor,
				positionMethod,
				floatingRootContext,
				mounted,
				side,
				sideOffset,
				align,
				alignOffset,
				collisionBoundary,
				collisionPadding,
				sticky,
				arrowPadding,
				disableAnchorTracking,
				keepMounted,
				collisionAvoidance,
				adaptiveOrigin: store.useState("adaptiveOrigin")
			});
			const element = usePositioner(componentProps, react.useMemo(() => ({
				open,
				side: positioning.side,
				align: positioning.align,
				anchorHidden: positioning.anchorHidden,
				instant: trackCursorAxis !== "none" ? "tracking-cursor" : instantType
			}), [
				open,
				positioning.side,
				positioning.align,
				positioning.anchorHidden,
				trackCursorAxis,
				instantType
			]), {
				styles: positioning.positionerStyles,
				transitionStatus,
				props: elementProps,
				refs: [forwardedRef, store.useStateSetter("positionerElement")],
				hidden: !mounted,
				inert: !open || trackCursorAxis === "both" || disableHoverablePopup
			});
			return /*#__PURE__*/ (0, react_jsx_runtime.jsx)(TooltipPositionerContext.Provider, {
				value: positioning,
				children: element
			});
		});
		//#endregion
		//#region node_modules/.pnpm/@base-ui+react@1.9.0_@date-fns+tz@1.5.0_@types+react@18.3.31_date-fns@4.4.0_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/react/tooltip/popup/TooltipPopup.mjs
		/**
		* A container for the tooltip contents.
		* Renders a `<div>` element.
		*
		* Documentation: [Base UI Tooltip](https://base-ui.com/react/components/tooltip)
		*/
		const TooltipPopup = /*#__PURE__*/ react.forwardRef(function TooltipPopup(componentProps, forwardedRef) {
			const { render, className, style, ...elementProps } = componentProps;
			const store = useTooltipRootContext();
			const { side, align } = useTooltipPositionerContext();
			const open = store.useState("open");
			const instantType = store.useState("instantType");
			const transitionStatus = store.useState("transitionStatus");
			const popupProps = store.useState("popupProps");
			const floatingContext = store.useState("floatingRootContext");
			const disabled = store.useState("disabled");
			const closeDelay = store.useState("closeDelay");
			useOpenChangeComplete({
				open,
				ref: store.context.popupRef,
				onComplete() {
					if (open) store.context.onOpenChangeComplete?.(true);
				}
			});
			useHoverFloatingInteraction(floatingContext, {
				enabled: !disabled,
				closeDelay
			});
			const setPopupElement = store.useStateSetter("popupElement");
			return useRenderElement("div", componentProps, {
				state: {
					open,
					side,
					align,
					instant: instantType,
					transitionStatus
				},
				ref: [
					forwardedRef,
					store.context.popupRef,
					setPopupElement
				],
				props: [
					FOCUSABLE_POPUP_PROPS,
					popupProps,
					getDisabledMountTransitionStyles(transitionStatus),
					elementProps
				],
				stateAttributesMapping: popupTransitionStateMapping
			});
		});
		//#endregion
		//#region node_modules/.pnpm/@base-ui+utils@0.5.0_@types+react@18.3.31_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/utils/inertValue.mjs
		function inertValue(value) {
			if (isReactVersionAtLeast(19)) return value;
			return value ? "true" : void 0;
		}
		//#endregion
		//#region packages/client/src/client/appearance-scope.ts
		const APPEARANCE_CLASS = "bh-appearance-scope";
		//#endregion
		//#region packages/client/src/client/ds/kbd.tsx
		const KEY_NAMES = {
			Mod: "Ctrl",
			Shift: "Shift",
			Enter: "Enter",
			Alt: "Alt"
		};
		function isApplePlatform(source) {
			const resolved = source ?? (typeof navigator === "undefined" ? void 0 : navigator);
			const platform = resolved?.userAgentData?.platform ?? resolved?.platform ?? "";
			return /mac|iphone|ipad|ipod/iu.test(platform);
		}
		function shortcutKeyLabel(key, apple) {
			if (key === "Mod") return apple ? "⌘" : "Ctrl";
			if (key === "Alt") return apple ? "⌥" : "Alt";
			if (key === "Shift") return "⇧";
			if (key === "Enter") return "↵";
			return key;
		}
		function shortcutKeyName(key, apple) {
			if (key === "Mod" && apple) return "Command";
			if (key === "Alt" && apple) return "Option";
			return KEY_NAMES[key] ?? key;
		}
		function Kbd({ shortcutKey, apple = isApplePlatform() }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("kbd", {
				title: shortcutKeyName(shortcutKey, apple),
				className: "bhx3nfvp2 bhx6s0dn4 bhxl56j7k bhx1oslful bhx17rw0jw bhx1w8vjyx bhx1sfpsak bhx1y0btm7 bhx7vmdhn bhx1cx41gz bhxibs1lc bhx24dycr bhxjb2p0i bhxgowt09 bhxo5v014 bhxuxw1ft",
				children: shortcutKeyLabel(shortcutKey, apple)
			});
		}
		function KeyCombo({ keys, apple = isApplePlatform() }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				"data-key-combo": keys.join("+"),
				className: "bhx3nfvp2 bhx6s0dn4 bhx5v8n67 bhxxymvpz",
				children: keys.map((key) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Kbd, {
					shortcutKey: key,
					apple
				}, key))
			});
		}
		//#endregion
		//#region packages/client/src/client/ds/tooltip.tsx
		const shared = globalThis;
		const InstantTooltips = shared[Symbol.for("botharness.instant-tooltips")] ??= (0, react.createContext)(false);
		const DEFAULT_DELAY_MS = 500;
		function clipped(node) {
			if (node === null) return false;
			const target = node.querySelector("[data-tooltip-clip]") ?? node;
			return target.scrollWidth > target.clientWidth + 1 || target.scrollHeight > target.clientHeight + 1;
		}
		function Tooltip({ label, shortcutKeys, side = "top", align = "center", delayMs = DEFAULT_DELAY_MS, gap = 6, disabled = false, maxWidth = 280, openOnClick = false, onlyWhenClipped = false, children }) {
			const instant = (0, react.useContext)(InstantTooltips);
			const descriptionId = (0, react.useId)();
			const trigger = (0, react.useRef)(null);
			const [open, setOpen] = (0, react.useState)(false);
			const attach = (0, react.useCallback)((node) => {
				trigger.current = node;
			}, []);
			const text = typeof label === "function" ? label() : label;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(TooltipRoot, {
				open,
				disabled: disabled || text === "",
				onOpenChange: (next) => {
					if (next && onlyWhenClipped && !clipped(trigger.current)) return;
					setOpen(next);
				},
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(TooltipTrigger, {
					ref: attach,
					"aria-describedby": open ? descriptionId : void 0,
					delay: instant ? 0 : delayMs,
					closeOnClick: !openOnClick,
					render: children,
					onClick: openOnClick ? () => setOpen((value) => !value) : void 0
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(TooltipPortal, { children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(TooltipPositioner, {
					side,
					align,
					sideOffset: gap,
					collisionPadding: 8,
					className: "bhx1i7x82i bhx47corl",
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(TooltipPopup, {
						id: descriptionId,
						role: "tooltip",
						className: [APPEARANCE_CLASS, { className: "bhx9f619 bhx3nfvp2 bhx6s0dn4 bhx1e5nl48 bhx1bcthrq bhx7em7do bhxvz6vxc bhxdoljrk bhxwm96u7 bhxh82noc bhx1g71p44 bhxj0a0fe bhxpv5g7k bhx1cbrp87 bhx1u6grsq" }.className].join(" "),
						style: { maxWidth },
						children: [text, shortcutKeys === void 0 || shortcutKeys.length === 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "bhx3nfvp2 bhxwm96u7 bhxf9vgkq",
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(KeyCombo, { keys: shortcutKeys })
						})]
					})
				}) })]
			});
		}
		//#endregion
		//#region packages/client/src/client/telemetry-surface.ts
		function telemetrySurface() {
			return typeof globalThis === "object" && "dshDesktop" in globalThis ? "desktop_app" : "browser";
		}
		function recordViewerOpen(rpc, panel) {
			rpc?.call("/api", "botharness/telemetryEvent", { args: {
				event: "viewer:subpanel_open",
				properties: {
					panel,
					surface: telemetrySurface()
				}
			} }).catch(() => {});
		}
		//#endregion
		//#region packages/client/src/client/ds/info-tip.tsx
		function InfoTip({ label, text }) {
			const id = (0, react.useId)();
			const [hover, setHover] = (0, react.useState)(false);
			const [focus, setFocus] = (0, react.useState)(false);
			const [pinned, setPinned] = (0, react.useState)(false);
			const open = hover || focus || pinned;
			const anchor = (0, react.useRef)(null);
			const bubble = (0, react.useRef)(null);
			(0, react.useLayoutEffect)(() => {
				const node = bubble.current;
				const trigger = anchor.current;
				if (!open || !node || !trigger) return;
				const place = () => {
					const target = trigger.getBoundingClientRect();
					const gap = Number.parseFloat(getComputedStyle(trigger).fontSize) / 2 || 8;
					node.style.left = "0px";
					node.style.top = "0px";
					const origin = node.getBoundingClientRect();
					const left = Math.max(0, Math.min(target.left, window.innerWidth - origin.width));
					node.style.left = `${left - origin.left}px`;
					node.style.top = `${target.bottom + gap - origin.top}px`;
				};
				place();
				window.addEventListener("resize", place);
				window.addEventListener("scroll", place, true);
				return () => {
					window.removeEventListener("resize", place);
					window.removeEventListener("scroll", place, true);
				};
			}, [open]);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
				ref: anchor,
				className: "bhx1n2onr6 bhx3nfvp2 bhx2lah0s",
				onPointerEnter: () => {
					setHover(true);
				},
				onPointerLeave: () => {
					setHover(false);
				},
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					"aria-label": label,
					"aria-describedby": open ? id : void 0,
					"aria-expanded": pinned,
					onFocus: () => {
						setFocus(true);
					},
					onBlur: () => {
						setFocus(false);
						setPinned(false);
					},
					onClick: () => {
						setPinned((value) => !value);
					},
					onKeyDown: (event) => {
						if (event.key === "Escape" && open) {
							event.stopPropagation();
							setPinned(false);
							setHover(false);
							setFocus(false);
						}
					},
					className: "bhx3nfvp2 bhx6s0dn4 bhxl56j7k bhx1x2ywmj bhx6nhqxt bhx1717udv bhxc342km bhx13u8aww bhxjbqb8w bhx1axu3v7 bhx1a36vn4 bhx1146j2 bhx1a2a7pz bhx1i94p6w",
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
						width: "14",
						height: "14",
						viewBox: "0 0 14 14",
						"aria-hidden": "true",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
								cx: "7",
								cy: "7",
								r: "6",
								fill: "none",
								stroke: "currentColor",
								strokeWidth: "1.2"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
								d: "M7 6.2v3.6",
								stroke: "currentColor",
								strokeWidth: "1.3",
								strokeLinecap: "round"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
								cx: "7",
								cy: "4.3",
								r: "0.8",
								fill: "currentColor"
							})
						]
					})
				}), open ? (0, react_dom.createPortal)(/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					ref: bubble,
					id,
					role: "tooltip",
					className: "bhxixxii4 bhxu96u03 bhx13vifvy bhxp6lfbs bhxezivpi bhx1jkqq1h bhx1kz1gct bhxq23ktl bhx1i9s7pd bhx1k5awnc bhxb3z3mx bhx103lb5k bhx1779mkw bhxe5wb2f bhxo1l8bm bhxeaf4i8 bhx47corl",
					children: text
				}), document.body) : null]
			});
		}
		//#endregion
		//#region packages/client/src/client/ds/settings-row.tsx
		const SettingsGroupContext = (0, react.createContext)(false);
		const styles$2 = {
			rows: {
				k1xSpc: "bhx78zum5",
				kXwgrk: "bhxdt5ytf",
				k7Eaqz: "bhxeuugli",
				$$css: true
			},
			group: {
				k1xSpc: "bhx78zum5",
				kXwgrk: "bhxdt5ytf",
				kOIVth: "bhx103m73q",
				k7Eaqz: "bhxeuugli",
				kg3NbH: "bhxf5xh8h bhx1decy8s bhx1qyef7o",
				k8WAf4: "bhxggp0jn bhxup6t74 bhxvz3fld",
				kaIpWk: "bhxdylm0v bhxtm8dy7",
				kVQacm: "bhx7giv3",
				kWkggS: "bhx18mhnxz bhxu7tw00",
				kGVxlE: "bhx1yc4nx5 bhx6vyjea",
				$$css: true
			},
			row: {
				k1xSpc: "bhx78zum5",
				kGNEyG: "bhx6s0dn4 bhx4bgz6 bhx15bqsqq",
				kXwgrk: "bhx1q0g3np bhxcxmu7o bhx1uptv2i",
				kOIVth: "bhxfe3e77 bhx1bsqh3l bhx32nsh3",
				k7Eaqz: "bhxeuugli",
				kAzted: "bhx1bciaxd",
				kB7OPa: "bhx9f619",
				k8WAf4: "bhx1nxcsqp",
				kg3NbH: "bhx1avbwx3",
				kaIpWk: "bhx1voi8sm",
				kWkggS: "bhx1auanwt",
				kt9PQ7: "bhxxobqf9",
				kfdmCh: "bhx1q0q8m5",
				kL6WhQ: "bhx16stqrj bhx79v8zp bhx2jbcm5",
				$$css: true
			}
		};
		function SettingsRow({ title, icon, description, info, control, children, rootRef, data }) {
			const id = (0, react.useId)();
			const titleId = `${id}-title`;
			const descriptionId = `${id}-description`;
			const grouped = (0, react.useContext)(SettingsGroupContext);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				ref: rootRef,
				role: "group",
				"aria-labelledby": titleId,
				"aria-describedby": description === void 0 ? void 0 : descriptionId,
				"data-settings-row": "",
				...data,
				...{
					0: { className: "bhx78zum5 bhx6s0dn4 bhx4bgz6 bhx15bqsqq bhx1q0g3np bhxcxmu7o bhx1uptv2i bhxfe3e77 bhx1bsqh3l bhx32nsh3 bhxeuugli bhx1bciaxd bhx9f619 bhx1nxcsqp bhx1avbwx3 bhx1voi8sm bhx1auanwt bhxxobqf9 bhx1q0q8m5 bhx16stqrj bhx79v8zp bhx2jbcm5" },
					1: { className: "bhx78zum5 bhx6s0dn4 bhx4bgz6 bhx15bqsqq bhx1q0g3np bhxcxmu7o bhx1uptv2i bhxfe3e77 bhx1bsqh3l bhx32nsh3 bhxeuugli bhx1bciaxd bhx9f619 bhx1nxcsqp bhx1avbwx3 bhx1auanwt bhxxobqf9 bhx1q0q8m5 bhx16stqrj bhx79v8zp bhx2jbcm5 bhxdylm0v" }
				}[!!!grouped << 0],
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "bhx78zum5 bhx1cy8zhl bhx1iyjqo2 bhxeuugli bhxvdlyrv",
					children: [icon === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						"aria-hidden": "true",
						className: "bhxrvj5dj bhx1ku5rj1 bhx2lah0s bhxtbbyp4 bhxe2ximv bhx14lg19",
						children: icon
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "bhx78zum5 bhxdt5ytf bhx1c459s5 bhx1iyjqo2 bhxs83m0k bhx1r8uery bhxeuugli",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "bhx78zum5 bhx6s0dn4 bhx1e5nl48 bhxeuugli",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									id: titleId,
									className: "bhx103lb5k bhx1779mkw bhxe5wb2f bhx134zi0a bhxj0a0fe",
									children: title
								}), info === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(InfoTip, {
									label: info.label,
									text: info.text
								})]
							}),
							description === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								id: descriptionId,
								className: "bhx1axu3v7 bhxh82noc bhx1g71p44 bhxj0a0fe",
								children: description
							}),
							children
						]
					})]
				}), control === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "bhx78zum5 bhx1a02dak bhx6s0dn4 bhx13a6bvl bhx403fy9 bhx3xz8fp bhxvdlyrv bhx2lah0s bhxeuugli bhxh9uqaf bhx1r6q2vj bhx1cnm762",
					children: control
				})]
			});
		}
		function SettingsGroupPart({ children, rootRef, busy, role, label, data }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				ref: rootRef,
				role,
				"aria-label": label,
				"aria-busy": busy,
				"data-settings-part": "",
				...data,
				className: "bhx-default-marker bhxjp7ctv",
				children
			});
		}
		styles$2.row;
		//#endregion
		//#region packages/client/src/client/sidebar-card.tsx
		function SidebarCardList({ label, className, listRef, flush = false, children }) {
			if ((0, react.useContext)(SettingsGroupContext)) {
				const part = { className: "bhx-default-marker bhxjp7ctv" };
				return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
					ref: listRef,
					"aria-label": label,
					"data-settings-part": "",
					...part,
					className: className === void 0 ? part.className : `${part.className} ${className}`,
					children
				});
			}
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
				ref: listRef,
				"data-flush": flush || void 0,
				className: className === void 0 ? "bh-card-list" : "bh-card-list " + className,
				"aria-label": label,
				children
			});
		}
		function SidebarCardRow({ icon, leading, iconLabel, selection, title, titleClassName, badge, summary, flipKey, hint, chips, meta, trailing, trailingAlign, detail, onClick, onIntent, disabled, muted, mainClassName, dialog, expanded, controls, state, anchor }) {
			const inGroup = (0, react.useContext)(SettingsGroupContext);
			const body = /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
				leading === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: "bh-card-leading",
					children: leading
				}),
				icon === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: "bh-card-icon",
					role: iconLabel === void 0 ? void 0 : "img",
					"aria-label": iconLabel,
					title: iconLabel,
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ChannelSidebarIcon, {
						name: icon,
						size: 16
					})
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
					className: "bh-card-body",
					children: [
						badge === void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: titleClassName === void 0 ? "bh-card-title" : "bh-card-title " + titleClassName,
							children: title
						}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: "bh-card-title-row",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: titleClassName === void 0 ? "bh-card-title" : "bh-card-title " + titleClassName,
								children: title
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "bh-card-badge",
								children: badge
							})]
						}),
						summary === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "bh-card-summary",
							children: summary
						}),
						chips === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "bh-card-chips",
							children: chips
						}),
						meta === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "bh-card-meta",
							children: meta
						})
					]
				})
			] });
			const className = mainClassName === void 0 ? "bh-card-main" : "bh-card-main " + mainClassName;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", {
				className: "bh-card-row",
				"data-settings-row": inGroup ? "" : void 0,
				"data-muted": muted === true ? "true" : void 0,
				"data-state": state,
				"data-selected": selection?.checked === true ? "true" : void 0,
				"data-anchor": anchor,
				"data-flip-key": flipKey,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "bh-card-line",
					children: [selection?.multiple === true ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
						className,
						title: hint,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							className: "bh-card-checkbox",
							type: "checkbox",
							checked: selection.checked,
							disabled,
							onChange: onClick
						}), body]
					}) : onClick === void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className,
						title: hint,
						children: body
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className,
						title: hint,
						disabled,
						"aria-pressed": selection?.checked,
						"aria-haspopup": dialog === true ? "dialog" : void 0,
						"aria-expanded": expanded,
						"aria-controls": controls,
						onClick,
						onPointerEnter: onIntent === void 0 ? void 0 : (event) => {
							if (event.pointerType !== "touch") onIntent();
						},
						onFocus: onIntent,
						children: body
					}), trailing === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "bh-card-trailing",
						"data-card-trailing": trailingAlign,
						children: trailing
					})]
				}), detail === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					id: controls,
					className: "bh-card-detail",
					children: detail
				})]
			});
		}
		//#endregion
		//#region packages/browser/src/client/locale.ts
		const LOCALE_NS = "botharness-browser";
		const zh = {
			"entry.profile.install": "安装 BotHarness Profile 控制扩展",
			"entry.profile.instructions": "在 BotHarness Profile 控制扩展中输入地址和配对码，并确认允许整个 Profile。",
			"entry.profile.forget": "解除 Profile 配对",
			"entry.profile.disconnected": "Profile 已配对，连接已断开",
			"entry.profile.connected": "Profile 已连接",
			"entry.profile.pair": "配对 Chrome Profile",
			"entry.profile.scope": "此 Chrome Profile 的所有普通网页标签页",
			"settings.profile-control": "日常 Chrome · 整个 Profile",
			"settings.daily-control": "日常 Chrome · 控制",
			"entry.daily.install": "安装 Playwright 扩展",
			"entry.daily.connect": "连接现有页面",
			"entry.daily.select": "请在 Chrome 中选择一个现有标签页",
			"entry.daily.confirm": "已连接，尚未允许操作",
			"entry.daily.controlled": "已允许此页面的读取、输入和点击",
			"entry.daily.allow": "允许控制此页面",
			"entry.live": "已连接",
			"entry.noScreen": "暂无画面",
			"entry.connecting": "连接中",
			"entry.reconnecting": "正在重新连接",
			"entry.reconnect": "重新连接",
			"entry.openFullscreen": "打开大屏",
			"entry.collapseFullscreen": "收起全屏",
			"entry.interactive.disable": "停止交互",
			"entry.interactive.enable": "开启交互",
			"entry.watchOnly": "观看模式",
			"entry.stop": "停止",
			"entry.stopping": "停止中",
			"settings.localDriver": "本机驱动",
			"settings.containerDriver": "容器驱动",
			"settings.driver.current": "默认",
			"settings.driver.agent-browser": "agent-browser（试用）",
			"settings.section": "浏览器控制",
			"settings.target": "操作目标",
			"settings.local": "本机 Browser",
			"settings.container": "Docker Browser",
			"settings.extension": "日常浏览器",
			"entry.borrow.none": "尚未借用标签页",
			"entry.borrow.readOnly": "只读借用中",
			"entry.borrow.pair": "连接浏览器扩展",
			"entry.borrow.return": "归还标签页",
			"entry.borrow.code": "配对码",
			"entry.borrow.cancel": "取消配对",
			"entry.borrow.instructions": "在扩展中输入此地址和配对码，再选择借出当前页面。配对码 5 分钟内有效，仅可使用一次。",
			"entry.view.interaction": "允许 Human 操作",
			"entry.view.inputMode.direct": "直接点按",
			"entry.view.inputMode.trackpad": "触控板",
			"entry.view.close": "关闭",
			"entry.view.container": "容器浏览器",
			"entry.view.browserTitle": "{name}的浏览器",
			"entry.takeover.start": "接管",
			"entry.takeover.stop": "取消接管",
			"entry.takeover.active": "接管中",
			"entry.label": "浏览器",
			"entry.access.title": "Browser Access",
			"entry.access.on": "Browser Access 已开启",
			"entry.access.description": "开启后，该 Bot 的会话可以使用浏览器",
			"entry.access.enable": "启用 Browser Access",
			"entry.access.disable": "停用 Browser Access",
			"entry.access.failed": "切换 Browser Access 失败",
			"entry.access.failureHint": "授权失败",
			"entry.profile.label": "Profile",
			"entry.profile.default": "default",
			"entry.profile.failed": "切换浏览器 profile 失败",
			"entry.profile.choose": "选择浏览器 Profile",
			"entry.profile.create": "创建“{name}”",
			"entry.view.follow": "跟随 Bot",
			"entry.view.pause": "暂停 Bot",
			"entry.view.resume": "继续",
			"entry.view.open": "打开 Bot 浏览器",
			"entry.view.fullscreen": "全屏",
			"entry.view.stop": "停止",
			"entry.view.cleanupFailed": "浏览器清理失败。点击“停止”重试。",
			"entry.view.opening": "正在打开…",
			"entry.view.noFrame": "暂无画面",
			"entry.view.noTabs": "暂无标签页",
			"entry.view.tabs": "标签页",
			"entry.chip.running": "运行中",
			"entry.chip.stopped": "未运行",
			"entry.chip.paused": "已暂停",
			"entry.chip.disconnected": "未连接",
			"entry.chip.connecting": "连接中",
			"entry.chip.confirm": "待允许",
			"entry.chip.controlled": "可操作",
			"entry.chip.unpaired": "未配对",
			"entry.chip.offline": "已断开",
			"entry.chip.connected": "已连接",
			"entry.chip.notShared": "未借用",
			"entry.chip.readOnly": "只读",
			"entry.provision.preparing": "正在准备下载浏览器…",
			"entry.provision.downloading": "正在下载浏览器…{percent}%（{downloaded}/{total}）",
			"entry.fail.details": "详情",
			"entry.fail.provision-no-network.title": "浏览器下载失败——本机网络似乎不通。",
			"entry.fail.provision-no-network.fault": "这是本机网络的问题，不是你的设置问题。",
			"entry.fail.provision-no-network.action": "让本机连上网后，再点一次“打开”。",
			"entry.fail.provision-no-disk-space.title": "浏览器下载失败——磁盘空间不足。",
			"entry.fail.provision-no-disk-space.fault": "这是本机剩余空间的问题。",
			"entry.fail.provision-no-disk-space.action": "至少腾出 500 MB 空间后，再点一次“打开”。",
			"entry.fail.provision-no-permission.title": "浏览器下载失败——下载目录不可写。",
			"entry.fail.provision-no-permission.fault": "这是本机目录权限的问题。",
			"entry.fail.provision-no-permission.action": "请机器管理员放开浏览器目录的写权限后，再点一次“打开”。",
			"entry.fail.provision-missing-libs.title": "这台机器缺少浏览器需要的系统库。",
			"entry.install.missing": "需要安装 {count} 个系统包。",
			"entry.install.manual": "安装需要管理员密码。请在这台机器的终端里运行下面的命令，装好后再点「打开」。",
			"entry.install.button": "一键安装",
			"entry.install.copy": "复制命令",
			"entry.install.copied": "已复制",
			"entry.install.progress": "正在安装系统库：{percent}%",
			"entry.fail.provision-missing-libs.fault": "这是机器环境的问题，不是浏览器设置的问题。",
			"entry.fail.provision-missing-libs.action": "Ubuntu 24.04 上按“详情”里的命令安装系统库，装好后再点“打开”。",
			"entry.fail.provision-failed.title": "浏览器下载失败。",
			"entry.fail.provision-failed.fault": "暂时看不出具体原因。",
			"entry.fail.provision-failed.action": "再点一次“打开”重试；多次失败请把“详情”发给机器管理员。",
			"entry.fail.startup-missing-binary.title": "配置的浏览器文件不存在。",
			"entry.fail.startup-missing-binary.fault": "这是插件配置里的浏览器路径问题。",
			"entry.fail.startup-missing-binary.action": "修正浏览器插件配置中的 browserPath，或清空它改用自动下载。",
			"entry.fail.startup-spawn-failed.title": "浏览器程序无法启动。",
			"entry.fail.startup-spawn-failed.fault": "本机拦截或删除了浏览器文件——常见是杀毒软件，偶尔是权限问题。",
			"entry.fail.startup-spawn-failed.action": "把浏览器目录加入杀毒软件白名单（或找机器管理员看权限），再点一次“打开”。",
			"entry.fail.startup-sandbox.title": "浏览器因系统沙箱限制拒绝启动。",
			"entry.fail.startup-sandbox.fault": "这是本机系统限制的问题。",
			"entry.fail.startup-sandbox.action": "Ubuntu 23.10 起通常是 AppArmor 限制了用户命名空间：按“详情”给这个浏览器加 AppArmor 配置后，再点一次“打开”。",
			"entry.fail.startup-crashed.title": "浏览器在启动过程中退出了。",
			"entry.fail.startup-crashed.fault": "这是本机浏览器的问题，不是页面问题。",
			"entry.fail.startup-crashed.action": "再点一次“打开”重试；多次失败请把“详情”发给机器管理员。",
			"entry.fail.startup-timeout.title": "浏览器启动超时。",
			"entry.fail.startup-timeout.fault": "这台机器可能比较慢或负载较高。",
			"entry.fail.startup-timeout.action": "再点一次“打开”重试；多次失败请重启机器或联系管理员。",
			"entry.error": "浏览器操作失败"
		};
		const en = {
			"entry.profile.install": "Install BotHarness Profile Control extension",
			"entry.profile.instructions": "Enter the address and code in the BotHarness Profile Control extension and confirm Profile-wide access.",
			"entry.profile.forget": "Forget Profile pairing",
			"entry.profile.disconnected": "Profile paired · disconnected",
			"entry.profile.connected": "Profile connected",
			"entry.profile.pair": "Pair Chrome Profile",
			"entry.profile.scope": "All ordinary webpage tabs in this Chrome Profile",
			"settings.profile-control": "Daily Chrome · Entire Profile",
			"settings.daily-control": "Daily Chrome · Control",
			"entry.daily.install": "Install Playwright extension",
			"entry.daily.connect": "Connect existing page",
			"entry.daily.select": "Select one existing Chrome tab",
			"entry.daily.confirm": "Connected · control not granted",
			"entry.daily.controlled": "This document allows observe, type and click",
			"entry.daily.allow": "Allow control of this document",
			"entry.live": "Connected",
			"entry.noScreen": "No screen",
			"entry.connecting": "Connecting",
			"entry.reconnecting": "Reconnecting",
			"entry.reconnect": "Reconnect",
			"entry.openFullscreen": "Open fullscreen",
			"entry.collapseFullscreen": "Leave fullscreen",
			"entry.interactive.disable": "Disable interaction",
			"entry.interactive.enable": "Enable interaction",
			"entry.watchOnly": "Watch only",
			"entry.stop": "Stop",
			"entry.stopping": "Stopping",
			"settings.localDriver": "Local driver",
			"settings.containerDriver": "Container driver",
			"settings.driver.current": "Default",
			"settings.driver.agent-browser": "agent-browser (trial)",
			"settings.section": "Browser",
			"settings.target": "Browser Target",
			"settings.local": "Local Browser",
			"settings.container": "Docker Browser",
			"settings.extension": "Daily Browser",
			"entry.borrow.none": "No shared tab",
			"entry.borrow.readOnly": "Shared read-only",
			"entry.borrow.pair": "Connect browser extension",
			"entry.borrow.return": "Return tab",
			"entry.borrow.code": "Pairing code",
			"entry.borrow.cancel": "Cancel pairing",
			"entry.borrow.instructions": "Enter this address and code in the extension, then share the current page. The code expires in 5 minutes and can be used once.",
			"entry.view.interaction": "Enable Human interaction",
			"entry.view.inputMode.direct": "Direct tap",
			"entry.view.inputMode.trackpad": "Trackpad",
			"entry.view.close": "Close",
			"entry.view.container": "Container Browser",
			"entry.view.browserTitle": "{name}'s Browser",
			"entry.takeover.start": "Take over",
			"entry.takeover.stop": "Release",
			"entry.takeover.active": "Taking over",
			"entry.label": "Browser",
			"entry.access.title": "Browser Access",
			"entry.access.on": "Browser Access is on",
			"entry.access.description": "This PersonaBot's sessions may use the browser",
			"entry.access.enable": "Enable Browser Access",
			"entry.access.disable": "Disable Browser Access",
			"entry.access.failed": "Failed to switch Browser Access",
			"entry.access.failureHint": "Access failed",
			"entry.profile.label": "Profile",
			"entry.profile.default": "default",
			"entry.profile.failed": "Failed to switch the browser profile",
			"entry.profile.choose": "Choose browser profile",
			"entry.profile.create": "Create “{name}”",
			"entry.view.follow": "Follow the Bot",
			"entry.view.pause": "Pause Bot",
			"entry.view.resume": "Resume",
			"entry.view.open": "Open Bot Browser",
			"entry.view.fullscreen": "Fullscreen",
			"entry.view.stop": "Stop",
			"entry.view.cleanupFailed": "Browser cleanup failed. Click Stop to retry.",
			"entry.view.opening": "Opening…",
			"entry.view.noFrame": "No frame yet",
			"entry.view.noTabs": "No tabs yet",
			"entry.view.tabs": "Tabs",
			"entry.chip.running": "Running",
			"entry.chip.stopped": "Stopped",
			"entry.chip.paused": "Paused",
			"entry.chip.disconnected": "Not connected",
			"entry.chip.connecting": "Connecting",
			"entry.chip.confirm": "Needs approval",
			"entry.chip.controlled": "Controllable",
			"entry.chip.unpaired": "Not paired",
			"entry.chip.offline": "Disconnected",
			"entry.chip.connected": "Connected",
			"entry.chip.notShared": "Not shared",
			"entry.chip.readOnly": "Read-only",
			"entry.provision.preparing": "Preparing the browser download…",
			"entry.provision.downloading": "Downloading browser… {percent}% ({downloaded} / {total})",
			"entry.fail.details": "Details",
			"entry.fail.provision-no-network.title": "The browser download failed — this machine looks offline.",
			"entry.fail.provision-no-network.fault": "This is about the network on this machine, not your settings.",
			"entry.fail.provision-no-network.action": "Reconnect this machine to the internet, then click Open again.",
			"entry.fail.provision-no-disk-space.title": "The browser download failed — the disk is full.",
			"entry.fail.provision-no-disk-space.fault": "This is about free space on this machine.",
			"entry.fail.provision-no-disk-space.action": "Free at least 500 MB, then click Open again.",
			"entry.fail.provision-no-permission.title": "The browser download failed — the download folder is not writable.",
			"entry.fail.provision-no-permission.fault": "This is about folder permissions on this machine.",
			"entry.fail.provision-no-permission.action": "Ask the machine owner to make the browser folder writable, then click Open again.",
			"entry.fail.provision-missing-libs.title": "This machine is missing system libraries the browser needs.",
			"entry.install.missing": "{count} system packages need to be installed.",
			"entry.install.manual": "Installing needs an administrator password. Run this command in a terminal on this machine, then click Open again.",
			"entry.install.button": "Install",
			"entry.install.copy": "Copy command",
			"entry.install.copied": "Copied",
			"entry.install.progress": "Installing system libraries: {percent}%",
			"entry.fail.provision-missing-libs.fault": "This is about the machine setup, not your browser settings.",
			"entry.fail.provision-missing-libs.action": "On Ubuntu 24.04, install them with the command in Details, then click Open again.",
			"entry.fail.provision-failed.title": "The browser download failed.",
			"entry.fail.provision-failed.fault": "The cause is unclear from here.",
			"entry.fail.provision-failed.action": "Click Open to retry; if it keeps failing, show Details to the machine owner.",
			"entry.fail.startup-missing-binary.title": "The configured browser file does not exist.",
			"entry.fail.startup-missing-binary.fault": "This is about the browser path in the plugin configuration.",
			"entry.fail.startup-missing-binary.action": "Fix browserPath in the browser plugin configuration, or clear it to use the automatic download.",
			"entry.fail.startup-spawn-failed.title": "The browser program could not be started.",
			"entry.fail.startup-spawn-failed.fault": "This machine blocked or removed the browser file — often antivirus, sometimes permissions.",
			"entry.fail.startup-spawn-failed.action": "Allow-list the browser folder in your antivirus (or ask the machine owner about permissions), then click Open again.",
			"entry.fail.startup-sandbox.title": "The browser refused to start because of its OS sandbox.",
			"entry.fail.startup-sandbox.fault": "This is about OS restrictions on this machine.",
			"entry.fail.startup-sandbox.action": "On Ubuntu 23.10 and later this is usually AppArmor restricting user namespaces: add the AppArmor profile from Details for this browser, then click Open again.",
			"entry.fail.startup-crashed.title": "The browser exited during startup.",
			"entry.fail.startup-crashed.fault": "This is about the browser on this machine, not the page.",
			"entry.fail.startup-crashed.action": "Click Open to retry; if it keeps failing, show Details to the machine owner.",
			"entry.fail.startup-timeout.title": "The browser took too long to start.",
			"entry.fail.startup-timeout.fault": "This machine may be slow or overloaded.",
			"entry.fail.startup-timeout.action": "Click Open to retry; if it keeps failing, restart the machine or ask its owner.",
			"entry.error": "Browser action failed"
		};
		//#endregion
		//#region packages/browser/src/failure-kinds.ts
		const BROWSER_FAILURE_KINDS = [
			"provision-no-network",
			"provision-no-disk-space",
			"provision-no-permission",
			"provision-missing-libs",
			"provision-failed",
			"startup-missing-binary",
			"startup-spawn-failed",
			"startup-sandbox",
			"startup-crashed",
			"startup-timeout"
		];
		function isBrowserFailureKind(value) {
			return typeof value === "string" && BROWSER_FAILURE_KINDS.includes(value);
		}
		//#endregion
		//#region packages/client/src/client/ds/note.tsx
		const styles$1 = {
			note: {
				kogj98: "bhx1ghz6dp",
				kGuDYH: "bhxgowt09",
				kLWn49: "bhx12cu2lo",
				kHjlTd: "bhxj0a0fe",
				$$css: true
			},
			inset: {
				k8WAf4: "bhx89kiln",
				kg3NbH: "bhx1w8vjyx",
				$$css: true
			},
			muted: {
				kMwMTN: "bhxr3raxm",
				$$css: true
			},
			subtle: {
				kMwMTN: "bhxwq55zj",
				$$css: true
			},
			danger: {
				kMwMTN: "bhx8ay0r6",
				$$css: true
			},
			success: {
				kMwMTN: "bhx1pideu2",
				$$css: true
			},
			warning: {
				kMwMTN: "bhxz9v26x",
				$$css: true
			}
		};
		function Note({ tone = "muted", inset = false, children }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				role: tone === "danger" ? "alert" : "status",
				...props(styles$1.note, inset && styles$1.inset, styles$1[tone]),
				children
			});
		}
		//#endregion
		//#region packages/client/src/client/missing-packages.tsx
		function ProgressLine({ percent, label }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				role: "status",
				className: "bhxrvj5dj bhx5v8n67 bhxh8yej3 bhxr3raxm bhxgowt09 bhx12cu2lo",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("progress", {
					className: "bhxh8yej3 bhxols6we bhx1g31g6d",
					max: 100,
					value: Math.max(0, Math.min(100, percent))
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: label })]
			});
		}
		function MissingPackages({ command, access, installing, busy = false, onInstall, labels, children }) {
			const [copied, setCopied] = (0, react.useState)(false);
			const copy = () => {
				navigator.clipboard?.writeText(command).then(() => setCopied(true));
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "bhxrvj5dj bhx2zm2ee bhx619ttb bhxh8yej3",
				children: [
					installing === void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Note, {
						tone: "warning",
						children: labels.missing
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ProgressLine, {
						percent: installing.percent,
						label: installing.label
					}),
					access === "none" && installing === void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Note, { children: labels.manual }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("pre", {
						className: "bhx1ghz6dp bhxh8yej3 bhx9f619 bhx89kiln bhx1w8vjyx bhx4g09nt bhx1xojs80 bhx24dycr bhxmz2490 bhxgowt09 bhx12cu2lo bhx126k92a bhxj0a0fe",
						children: command
					})] }) : null,
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "bhx78zum5 bhx12e6dxb bhx1a02dak",
						children: [
							access !== "none" && installing === void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Button, {
								size: "sm",
								variant: "primary",
								disabled: busy,
								onClick: onInstall,
								children: labels.install
							}) : null,
							access === "none" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Button, {
								size: "sm",
								variant: "outline",
								onClick: copy,
								children: copied ? labels.copied : labels.copy
							}) : null,
							children
						]
					})
				]
			});
		}
		//#endregion
		//#region packages/browser/src/client/browser-failure.tsx
		var BrowserApiError = class extends Error {
			code;
			detail;
			packages;
			constructor(message, code, detail, packages) {
				super(message);
				this.name = "BrowserApiError";
				if (code !== void 0) this.code = code;
				if (detail !== void 0) this.detail = detail;
				if (packages !== void 0) this.packages = packages;
			}
		};
		function readFailure(cause) {
			if (cause instanceof BrowserApiError) return {
				message: cause.message,
				...cause.code === void 0 ? {} : { code: cause.code },
				...cause.detail === void 0 ? {} : { detail: cause.detail },
				...cause.packages === void 0 ? {} : { packages: cause.packages }
			};
			return { message: cause instanceof Error ? cause.message : String(cause) };
		}
		const INSTALL_ENDPOINT = "./api/browser/install-packages";
		function BrowserMissingLibs({ packages, t, onRetry }) {
			const [install, setInstall] = (0, react.useState)({});
			const [busy, setBusy] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)();
			const retried = (0, react.useRef)(false);
			const read = (0, react.useCallback)(async () => {
				const next = await (await fetch(INSTALL_ENDPOINT, { cache: "no-store" })).json();
				setInstall(next);
				return next;
			}, []);
			const resource = (0, react.useCallback)((node) => {
				if (node === null) return;
				read().catch(() => void 0);
			}, [read]);
			const poll = () => {
				read().then((next) => {
					if (next.state === "installing") {
						setTimeout(poll, 1e3);
						return;
					}
					if (next.state === "installed" && !retried.current) {
						retried.current = true;
						onRetry?.();
					}
				}).catch((cause) => setError(String(cause)));
			};
			const start = () => {
				setBusy(true);
				setError(void 0);
				fetch(INSTALL_ENDPOINT, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						authorize: true,
						packages
					})
				}).then(async (response) => {
					if (!response.ok) throw new Error((await response.json()).error);
					poll();
				}).catch((cause) => setError(String(cause))).finally(() => setBusy(false));
			};
			const installing = install.state === "installing";
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				ref: resource,
				className: "bh-browser-failure-install",
				children: [
					install.state === "failed" && install.text !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "bh-browser-failure-action",
						children: install.text
					}) : null,
					error === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "bh-browser-failure-action",
						children: error
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(MissingPackages, {
						command: `sudo apt install -y ${packages.join(" ")}`,
						access: install.access ?? "none",
						installing: installing ? {
							percent: install.percent ?? 0,
							label: t("entry.install.progress", { percent: String(install.percent ?? 0) })
						} : void 0,
						busy,
						onInstall: start,
						labels: {
							missing: t("entry.install.missing", { count: String(packages.length) }),
							manual: t("entry.install.manual"),
							install: t("entry.install.button"),
							copy: t("entry.install.copy"),
							copied: t("entry.install.copied")
						}
					})
				]
			});
		}
		function BrowserFailureNotice({ failure, t, onRetry }) {
			if (!isBrowserFailureKind(failure.code)) return null;
			const kind = failure.code;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				role: "alert",
				className: "bh-browser-failure",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "bh-browser-failure-title",
						children: t(`entry.fail.${kind}.title`)
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "bh-browser-failure-fault",
						children: t(`entry.fail.${kind}.fault`)
					}),
					kind === "provision-missing-libs" && (failure.packages?.length ?? 0) > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(BrowserMissingLibs, {
						packages: failure.packages ?? [],
						t,
						onRetry
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "bh-browser-failure-action",
						children: t(`entry.fail.${kind}.action`)
					}),
					failure.detail === void 0 || failure.detail === "" ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("details", {
						className: "bh-browser-failure-details",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("summary", { children: t("entry.fail.details") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("pre", { children: failure.detail })]
					})
				]
			});
		}
		function formatMiB(bytes) {
			return `${(bytes / 1048576).toFixed(1)} MB`;
		}
		function BrowserProvisionProgress({ progress, t }) {
			if (progress.totalBytes <= 0) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				role: "status",
				className: "bh-browser-progress",
				children: t("entry.provision.preparing")
			});
			const percent = Math.max(0, Math.min(99, Math.floor(progress.downloadedBytes / progress.totalBytes * 100)));
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				role: "status",
				className: "bh-browser-progress",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("progress", {
					className: "bh-browser-progress-bar",
					max: progress.totalBytes,
					value: Math.min(progress.downloadedBytes, progress.totalBytes)
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("entry.provision.downloading", {
					percent: String(percent),
					downloaded: formatMiB(progress.downloadedBytes),
					total: formatMiB(progress.totalBytes)
				}) })]
			});
		}
		//#endregion
		//#region packages/client/src/client/ds/input.tsx
		const Input = (0, react.forwardRef)(function Input({ icon, className, ...rest }, ref) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
				className: joinClass({ className: "bhx9f619 bhx3nfvp2 bhx6s0dn4 bhx12e6dxb bhxeuugli bhxisypcw bhx14i569m bhxvz6vxc bhxym0p2z bhx1ikcoup bhx1a2a7pz bhxay4pf5 bhx1g40iwv bhx1hc1fzr bhxozmhvb" }.className, className),
				children: [icon == null ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: "bhx3nfvp2 bhx2lah0s bhx1x2ywmj bhx6nhqxt bhx6s0dn4 bhxl56j7k bhx1axu3v7",
					children: icon
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
					ref,
					...rest,
					className: "bhx1iyjqo2 bhxeuugli bhx1717udv bhxc342km bhx1a2a7pz bhxjbqb8w bhx103lb5k bhxjb2p0i bhx1779mkw bhxe5wb2f bhx1t6c47z"
				})]
			});
		});
		(0, react.forwardRef)(function HiddenFileInput(props, ref) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
				ref,
				...props,
				type: "file",
				tabIndex: -1,
				className: "bhx10l6tqk bhx1i1rx1s bhxjm9jq1 bhxb3r6kr bhx1hyvwdk bhxuxw1ft"
			});
		});
		//#endregion
		//#region packages/client/src/client/anchored-panel.ts
		const useLegacyPosition = "useAnchoredPosition" in _deepseek_ai_dsh_client_ui_primitives ? _deepseek_ai_dsh_client_ui_primitives.useAnchoredPosition : void 0;
		function useAnchoredPanel({ open, anchorRef, panelRef, gap, margin, matchWidth = false }) {
			const position = useLegacyPosition?.({
				open,
				anchorRef,
				panelRef,
				gap,
				margin
			});
			const name = `--bh-panel-${(0, react.useId)().replace(/[^a-zA-Z0-9_-]/gu, "")}`;
			(0, react.useLayoutEffect)(() => {
				const anchor = anchorRef.current;
				if (useLegacyPosition !== void 0 || !open || anchor === null) return;
				const previous = anchor.style.getPropertyValue("anchor-name");
				const priority = anchor.style.getPropertyPriority("anchor-name");
				anchor.style.setProperty("anchor-name", name);
				return () => anchor.style.setProperty("anchor-name", previous, priority);
			}, [
				open,
				anchorRef,
				name
			]);
			if (useLegacyPosition !== void 0) return {
				...position,
				...matchWidth ? { width: anchorRef.current?.getBoundingClientRect().width ?? 200 } : {},
				visibility: position === null ? "hidden" : void 0
			};
			return {
				position: "fixed",
				positionAnchor: name,
				top: `max(${margin}px, var(--dsh-frame-overlay-top, ${margin}px), calc(anchor(bottom) + ${gap}px))`,
				bottom: margin,
				left: `max(${margin}px, anchor(left))`,
				right: margin,
				alignSelf: "start",
				justifySelf: "start",
				margin: 0,
				height: "fit-content",
				maxWidth: `calc(100vw - ${margin * 2}px)`,
				positionTryFallbacks: "flip-block, flip-inline, flip-block flip-inline",
				...matchWidth ? { width: `min(anchor-size(width), calc(100vw - ${margin * 2}px))` } : {}
			};
		}
		//#endregion
		//#region node_modules/.pnpm/@base-ui+react@1.9.0_@date-fns+tz@1.5.0_@types+react@18.3.31_date-fns@4.4.0_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/react/menu/positioner/MenuPositionerContext.mjs
		const MenuPositionerContext = /*#__PURE__*/ react.createContext(void 0);
		function useMenuPositionerContext(optional) {
			const context = react.useContext(MenuPositionerContext);
			if (context === void 0 && !optional) throw new Error(formatErrorMessage(33));
			return context;
		}
		//#endregion
		//#region node_modules/.pnpm/@base-ui+react@1.9.0_@date-fns+tz@1.5.0_@types+react@18.3.31_date-fns@4.4.0_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/react/menu/root/MenuRootContext.mjs
		const MenuRootContext = /*#__PURE__*/ react.createContext(void 0);
		function useMenuRootContext(optional) {
			const context = react.useContext(MenuRootContext);
			if (context === void 0 && !optional) throw new Error(formatErrorMessage(36));
			return context;
		}
		//#endregion
		//#region node_modules/.pnpm/@base-ui+react@1.9.0_@date-fns+tz@1.5.0_@types+react@18.3.31_date-fns@4.4.0_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/react/context-menu/root/ContextMenuRootContext.mjs
		const ContextMenuRootContext = /*#__PURE__*/ react.createContext(void 0);
		function useContextMenuRootContext(optional = true) {
			const context = react.useContext(ContextMenuRootContext);
			if (context === void 0 && !optional) throw new Error(formatErrorMessage(25));
			return context;
		}
		//#endregion
		//#region node_modules/.pnpm/@base-ui+react@1.9.0_@date-fns+tz@1.5.0_@types+react@18.3.31_date-fns@4.4.0_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/react/menu/filter-root/MenuFilterContext.mjs
		/**
		* The filter implementation that a filterable root hands to the parts below it. Only the roots
		* `Menu.FilterProvider` renders import it, so a plain menu never bundles it. Parts whose whole
		* structure differs are swapped as components; parts that only register with the filter call an
		* injected hook, so a menu that never renders them doesn't bundle a second implementation.
		*/
		/** Static below a filter root: the implementation never changes, so subscribers never re-render. */
		const MenuFilterImplContext = /*#__PURE__*/ react.createContext(null);
		/**
		* The filter implementation when the menu this part belongs to is filterable, otherwise `null`.
		* `virtualFocus` marks a filter root; a plain `Menu.Root` never sets it. The result is fixed for
		* a mounted part: a filter root can't appear above it without remounting it.
		*/
		function useMenuFilterImpl(scope = "root") {
			const impl = react.useContext(MenuFilterImplContext);
			const root = react.useContext(MenuRootContext);
			if (impl === null || root === void 0) return null;
			return (scope === "submenu-trigger" ? root.virtualFocus || root.parentVirtualFocus : root.virtualFocus) ? impl : null;
		}
		const UNFILTERED = {
			visible: true,
			ref: null
		};
		function useUnfilteredItem() {
			return UNFILTERED;
		}
		/**
		* Registers an item part with the filter of the menu it belongs to. A plain menu's items are
		* always visible.
		*/
		function useMenuFilterItem(props, forwardedRef, scope = "root") {
			const impl = useMenuFilterImpl(scope);
			const item = ((scope === "submenu-trigger" ? impl?.useSubmenuTrigger : impl?.useItem) ?? useUnfilteredItem)({
				label: props.label,
				children: props.children,
				render: props.render
			});
			const ref = useMergedRefs(forwardedRef, item.ref);
			return {
				visible: item.visible,
				ref,
				props: item.props
			};
		}
		//#endregion
		//#region node_modules/.pnpm/@base-ui+react@1.9.0_@date-fns+tz@1.5.0_@types+react@18.3.31_date-fns@4.4.0_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/react/internals/composite/root/CompositeRootContext.mjs
		const CompositeRootContext = /*#__PURE__*/ react.createContext(void 0);
		function useCompositeRootContext(optional = false) {
			const context = react.useContext(CompositeRootContext);
			if (context === void 0 && !optional) throw new Error(formatErrorMessage(16));
			return context;
		}
		//#endregion
		//#region node_modules/.pnpm/@base-ui+react@1.9.0_@date-fns+tz@1.5.0_@types+react@18.3.31_date-fns@4.4.0_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/react/utils/useFocusableWhenDisabled.mjs
		function useFocusableWhenDisabled(parameters) {
			const { focusableWhenDisabled, disabled, composite = false, tabIndex: tabIndexProp = 0, isNativeButton } = parameters;
			const isFocusableComposite = composite && focusableWhenDisabled !== false;
			const isNonFocusableComposite = composite && focusableWhenDisabled === false;
			return { props: react.useMemo(() => {
				const additionalProps = { onKeyDown(event) {
					if (disabled && focusableWhenDisabled && event.key !== "Tab") event.preventDefault();
				} };
				if (!composite) {
					additionalProps.tabIndex = tabIndexProp;
					if (!isNativeButton && disabled) additionalProps.tabIndex = focusableWhenDisabled ? tabIndexProp : -1;
				}
				if (isNativeButton && (focusableWhenDisabled || isFocusableComposite) || !isNativeButton && disabled) additionalProps["aria-disabled"] = disabled;
				if (isNativeButton && (!focusableWhenDisabled || isNonFocusableComposite)) additionalProps.disabled = disabled;
				return additionalProps;
			}, [
				composite,
				disabled,
				focusableWhenDisabled,
				isFocusableComposite,
				isNonFocusableComposite,
				isNativeButton,
				tabIndexProp
			]) };
		}
		//#endregion
		//#region node_modules/.pnpm/@base-ui+react@1.9.0_@date-fns+tz@1.5.0_@types+react@18.3.31_date-fns@4.4.0_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/react/utils/dispatchClickWithModifiers.mjs
		/**
		* Dispatches a constructed click on the target so it carries the source event's
		* modifier state, which `click()` always reports as unpressed. Like `click()`,
		* the untrusted click still runs native activation behavior (form submission,
		* link navigation).
		* `detail` defaults to 0 and `pointerType` to `''` (the native convention for
		* keyboard-generated clicks). When the click represents a mouse gesture, pass
		* `detail: 1` and `pointerType: 'mouse'` so consumers don't classify it as a
		* keyboard activation.
		*/
		function dispatchClickWithModifiers(target, sourceEvent, { detail = 0, pointerType = "" } = {}) {
			target.dispatchEvent(new (getWindow(target)).PointerEvent("click", {
				bubbles: true,
				cancelable: true,
				composed: true,
				detail,
				pointerType,
				shiftKey: sourceEvent.shiftKey,
				ctrlKey: sourceEvent.ctrlKey,
				altKey: sourceEvent.altKey,
				metaKey: sourceEvent.metaKey
			}));
		}
		//#endregion
		//#region node_modules/.pnpm/@base-ui+react@1.9.0_@date-fns+tz@1.5.0_@types+react@18.3.31_date-fns@4.4.0_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/react/internals/use-button/useButton.mjs
		function useButton(parameters = {}) {
			const { disabled = false, focusableWhenDisabled, tabIndex = 0, native: isNativeButton = true, composite: compositeProp } = parameters;
			const elementRef = react.useRef(null);
			const compositeRootContext = useCompositeRootContext(true);
			const isCompositeItem = compositeProp ?? compositeRootContext !== void 0;
			const { props: focusableWhenDisabledProps } = useFocusableWhenDisabled({
				focusableWhenDisabled,
				disabled,
				composite: isCompositeItem,
				tabIndex,
				isNativeButton
			});
			const updateDisabled = react.useCallback(() => {
				const element = elementRef.current;
				if (!isButtonElement(element)) return;
				if (isCompositeItem && disabled && focusableWhenDisabledProps.disabled === void 0 && element.disabled) element.disabled = false;
			}, [
				disabled,
				focusableWhenDisabledProps.disabled,
				isCompositeItem
			]);
			useIsoLayoutEffect(updateDisabled, [updateDisabled]);
			return {
				getButtonProps: react.useCallback((externalProps = {}) => {
					const { onClick: externalOnClick, onMouseDown: externalOnMouseDown, onKeyUp: externalOnKeyUp, onKeyDown: externalOnKeyDown, onPointerDown: externalOnPointerDown, ...otherExternalProps } = externalProps;
					return mergeProps({
						onClick(event) {
							if (disabled) {
								event.preventDefault();
								return;
							}
							externalOnClick?.(event);
						},
						onMouseDown(event) {
							if (!disabled) externalOnMouseDown?.(event);
						},
						onKeyDown(event) {
							if (disabled) return;
							makeEventPreventable(event);
							externalOnKeyDown?.(event);
							if (event.baseUIHandlerPrevented) return;
							const isCurrentTarget = event.target === event.currentTarget;
							const currentTarget = event.currentTarget;
							const isButton = isButtonElement(currentTarget);
							const isLink = !isNativeButton && isValidLinkElement(currentTarget);
							const shouldClick = isCurrentTarget && (isNativeButton ? isButton : !isLink);
							const isEnterKey = event.key === "Enter";
							const isSpaceKey = event.key === " ";
							const role = currentTarget.getAttribute("role");
							const isTextNavigationRole = role?.startsWith("menuitem") || role === "option" || role === "gridcell";
							if (isCurrentTarget && isCompositeItem && isSpaceKey) {
								if (event.defaultPrevented && isTextNavigationRole) return;
								event.preventDefault();
								if (!isNativeButton || isButton) {
									event.preventBaseUIHandler();
									dispatchClickWithModifiers(currentTarget, event);
								}
								return;
							}
							if (!shouldClick || isNativeButton || !isSpaceKey && !isEnterKey) {
								if (isCurrentTarget && isLink && isSpaceKey) event.preventDefault();
								return;
							}
							if (event.defaultPrevented) return;
							event.preventDefault();
							if (isEnterKey) {
								event.preventBaseUIHandler();
								dispatchClickWithModifiers(currentTarget, event);
							}
						},
						onKeyUp(event) {
							if (disabled) return;
							makeEventPreventable(event);
							externalOnKeyUp?.(event);
							if (event.target === event.currentTarget && isNativeButton && isCompositeItem && isButtonElement(event.currentTarget) && event.key === " ") {
								event.preventDefault();
								return;
							}
							if (event.baseUIHandlerPrevented) return;
							if (event.target === event.currentTarget && !isNativeButton && !isCompositeItem && !event.defaultPrevented && event.key === " ") {
								event.preventBaseUIHandler();
								dispatchClickWithModifiers(event.currentTarget, event);
							}
						},
						onPointerDown(event) {
							if (disabled) {
								event.preventDefault();
								return;
							}
							externalOnPointerDown?.(event);
						}
					}, isNativeButton ? { type: "button" } : { role: "button" }, focusableWhenDisabledProps, otherExternalProps);
				}, [
					disabled,
					focusableWhenDisabledProps,
					isCompositeItem,
					isNativeButton
				]),
				buttonRef: useStableCallback((element) => {
					elementRef.current = element;
					updateDisabled();
				})
			};
		}
		function isButtonElement(elem) {
			return isHTMLElement(elem) && elem.tagName === "BUTTON";
		}
		function isValidLinkElement(elem) {
			return isHTMLElement(elem) && elem.tagName === "A" && Boolean(elem.href);
		}
		//#endregion
		//#region node_modules/.pnpm/@base-ui+react@1.9.0_@date-fns+tz@1.5.0_@types+react@18.3.31_date-fns@4.4.0_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/react/menu/item/useMenuItemCommonProps.mjs
		function preventMouseDownDefault(event) {
			event.preventDefault();
		}
		/**
		* Returns common props shared by all menu item types.
		* This hook extracts the shared logic for id, role, tabIndex, and interaction handlers.
		*/
		function useMenuItemCommonProps(params) {
			const { closeOnClick, highlighted, id, nodeId, store, typingRef, itemRef, itemMetadata } = params;
			const rootContext = useMenuRootContext();
			const contextMenuContext = useContextMenuRootContext(true);
			const isSubmenuTrigger = itemMetadata.type === "submenu-trigger";
			const virtualFocus = isSubmenuTrigger ? rootContext.parentVirtualFocus : rootContext.virtualFocus;
			const ariaSelected = (isSubmenuTrigger && rootContext.parent.type === "menu" ? rootContext.parent.store : rootContext.store).useState("webkitAriaSelected", highlighted);
			const { events: menuEvents } = store.useState("floatingTreeRoot");
			const open = store.useState("open");
			const isContextMenu = contextMenuContext !== void 0;
			const tabIndex = !virtualFocus && open && highlighted ? 0 : -1;
			return react.useMemo(() => ({
				id,
				role: "menuitem",
				tabIndex,
				"aria-selected": ariaSelected,
				onMouseDown: virtualFocus ? preventMouseDownDefault : void 0,
				onKeyDown(event) {
					if (event.key === " " && typingRef?.current) event.preventDefault();
				},
				onMouseMove(event) {
					if (!nodeId) return;
					menuEvents.emit("itemhover", {
						nodeId,
						target: event.currentTarget
					});
				},
				onClick(event) {
					if (closeOnClick) menuEvents.emit("close", {
						domEvent: event.nativeEvent,
						reason: itemPress
					});
				},
				onMouseUp(event) {
					if (contextMenuContext) {
						const initialCursorPoint = contextMenuContext.initialCursorPointRef.current;
						contextMenuContext.initialCursorPointRef.current = null;
						if (isContextMenu && initialCursorPoint && Math.abs(event.clientX - initialCursorPoint.x) <= 1 && Math.abs(event.clientY - initialCursorPoint.y) <= 1) return;
						if (isContextMenu && !mac && event.button === 2) return;
					}
					if (itemRef.current && store.context.allowMouseUpTriggerRef.current && (!isContextMenu || event.button === 2)) {
						if (itemMetadata.type === "regular-item") dispatchClickWithModifiers(itemRef.current, event, {
							detail: 1,
							pointerType: "mouse"
						});
					}
				}
			}), [
				closeOnClick,
				tabIndex,
				id,
				menuEvents,
				nodeId,
				store.context.allowMouseUpTriggerRef,
				typingRef,
				itemRef,
				contextMenuContext,
				isContextMenu,
				itemMetadata.type,
				ariaSelected,
				virtualFocus
			]);
		}
		//#endregion
		//#region node_modules/.pnpm/@base-ui+react@1.9.0_@date-fns+tz@1.5.0_@types+react@18.3.31_date-fns@4.4.0_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/react/menu/item/useMenuItem.mjs
		const REGULAR_ITEM = { type: "regular-item" };
		function useMenuItem(params) {
			const { closeOnClick, disabled, highlighted, id, store, typingRef = store.context.typingRef, nativeButton, itemMetadata, nodeId } = params;
			const itemRef = react.useRef(null);
			const { getButtonProps, buttonRef } = useButton({
				disabled,
				focusableWhenDisabled: true,
				native: nativeButton,
				composite: true
			});
			const commonProps = useMenuItemCommonProps({
				closeOnClick,
				highlighted,
				id,
				nodeId,
				store,
				typingRef,
				itemRef,
				itemMetadata
			});
			const getItemProps = react.useCallback((externalProps) => {
				return mergeProps(commonProps, { onMouseEnter(event) {
					if (itemMetadata.type !== "submenu-trigger") return;
					itemMetadata.setActive(event.nativeEvent);
				} }, externalProps, getButtonProps);
			}, [
				commonProps,
				getButtonProps,
				itemMetadata
			]);
			const mergedRef = useMergedRefs(itemRef, buttonRef);
			return react.useMemo(() => ({
				getItemProps,
				itemRef: mergedRef
			}), [getItemProps, mergedRef]);
		}
		//#endregion
		//#region node_modules/.pnpm/@base-ui+react@1.9.0_@date-fns+tz@1.5.0_@types+react@18.3.31_date-fns@4.4.0_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/react/internals/composite/list/CompositeListContext.mjs
		const CompositeListContext = /*#__PURE__*/ react.createContext({
			register: () => {},
			unregister: () => {},
			subscribeMapChange: () => () => {},
			nextIndexRef: { current: 0 }
		});
		function useCompositeListContext() {
			return react.useContext(CompositeListContext);
		}
		//#endregion
		//#region node_modules/.pnpm/@base-ui+react@1.9.0_@date-fns+tz@1.5.0_@types+react@18.3.31_date-fns@4.4.0_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/react/internals/composite/list/useCompositeListItem.mjs
		/**
		* Used to register a list item and its index (DOM position) in the `CompositeList`.
		*/
		function useCompositeListItem(params = {}) {
			const { guess, label, metadata, textRef, index: externalIndex } = params;
			const { register, unregister, subscribeMapChange, nextIndexRef } = useCompositeListContext();
			const indexRef = react.useRef(-1);
			const [internalIndex, setInternalIndex] = react.useState(externalIndex == null && guess ? () => {
				if (indexRef.current === -1) {
					const newIndex = nextIndexRef.current;
					nextIndexRef.current += 1;
					indexRef.current = newIndex;
				}
				return indexRef.current;
			} : -1);
			const index = externalIndex ?? internalIndex;
			const componentRef = react.useRef(null);
			const ref = react.useCallback((node) => {
				const previousNode = componentRef.current;
				if (previousNode) unregister(previousNode);
				componentRef.current = node;
				if (node) register(node, {
					metadata: metadata ?? null,
					index: externalIndex ?? null,
					label,
					textRef
				});
			}, [
				externalIndex,
				register,
				unregister,
				metadata,
				label,
				textRef
			]);
			useIsoLayoutEffect(() => {
				if (externalIndex != null) return;
				return subscribeMapChange((map) => {
					const i = componentRef.current ? map.get(componentRef.current)?.index : null;
					if (i != null) setInternalIndex(i);
				});
			}, [externalIndex, subscribeMapChange]);
			return {
				ref,
				index
			};
		}
		//#endregion
		//#region node_modules/.pnpm/@base-ui+react@1.9.0_@date-fns+tz@1.5.0_@types+react@18.3.31_date-fns@4.4.0_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/react/menu/item/MenuItem.mjs
		const MenuItemPlain = /*#__PURE__*/ react.forwardRef(function MenuItemPlain(componentProps, forwardedRef) {
			const { render, className, id: idProp, label, nativeButton = false, disabled: disabledProp = false, closeOnClick = true, style, ...elementProps } = componentProps;
			const { store } = useMenuRootContext();
			const listItem = useCompositeListItem({
				guess: true,
				label
			});
			const id = useBaseUiId(idProp);
			const rootDisabled = store.useState("disabled");
			const highlighted = store.useState("isActive", listItem.index);
			const nodeId = store.useState("floatingNodeId");
			const itemProps = store.useState("itemProps");
			const disabled = disabledProp || rootDisabled;
			const { getItemProps, itemRef } = useMenuItem({
				closeOnClick,
				disabled,
				highlighted,
				id,
				store,
				nativeButton,
				nodeId,
				itemMetadata: REGULAR_ITEM
			});
			return useRenderElement("div", componentProps, {
				state: {
					disabled,
					highlighted
				},
				props: [
					itemProps,
					elementProps,
					getItemProps
				],
				ref: [
					itemRef,
					forwardedRef,
					listItem.ref
				]
			});
		});
		const MenuItem = /*#__PURE__*/ react.forwardRef(function MenuItem(props, forwardedRef) {
			const filterItem = useMenuFilterItem(props, forwardedRef);
			if (!filterItem.visible) return null;
			return /*#__PURE__*/ (0, react_jsx_runtime.jsx)(MenuItemPlain, {
				...props,
				ref: filterItem.ref
			});
		});
		//#endregion
		//#region node_modules/.pnpm/@base-ui+react@1.9.0_@date-fns+tz@1.5.0_@types+react@18.3.31_date-fns@4.4.0_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/react/toolbar/root/ToolbarRootContext.mjs
		const ToolbarRootContext = /*#__PURE__*/ react.createContext(void 0);
		function useToolbarRootContext(optional) {
			const context = react.useContext(ToolbarRootContext);
			if (context === void 0 && !optional) throw new Error(formatErrorMessage(69));
			return context;
		}
		const COMPOSITE_KEYS = /* @__PURE__ */ new Set([
			"ArrowUp",
			"ArrowDown",
			"ArrowLeft",
			"ArrowRight",
			"Home",
			"End"
		]);
		//#endregion
		//#region node_modules/.pnpm/@base-ui+react@1.9.0_@date-fns+tz@1.5.0_@types+react@18.3.31_date-fns@4.4.0_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/react/menu/submenu-root/MenuSubmenuRootContext.mjs
		const MenuSubmenuRootContext = /*#__PURE__*/ react.createContext(void 0);
		function useMenuSubmenuRootContext() {
			return react.useContext(MenuSubmenuRootContext);
		}
		//#endregion
		//#region node_modules/.pnpm/@base-ui+react@1.9.0_@date-fns+tz@1.5.0_@types+react@18.3.31_date-fns@4.4.0_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/react/internals/resolveRenderedId.mjs
		/**
		* Resolves an element's id using the same precedence as `useRenderElement`.
		* Returns `''` when the element renders with an explicitly empty id, which consumers must treat
		* as "no id" rather than falling back to the generated one, so ARIA relationships never reference
		* an id no element carries. Render callbacks are opaque and are expected to use the id passed to
		* them.
		*
		* @internal
		*/
		function resolveRenderedId(props, fallbackId) {
			const render = unwrapLazyRenderProp(props.render);
			if (/*#__PURE__*/ react.isValidElement(render)) {
				const renderProps = render.props;
				if (Object.hasOwn(renderProps, "id")) return renderProps.id ?? "";
			}
			return props.id ?? fallbackId;
		}
		/**
		* Resolves the element's id and returns a ref that publishes it to the owner while mounted.
		* A generated fallback is never published as an override, so removing an explicit id lets the
		* element return to the generated one.
		*
		* @internal
		*/
		function useRenderedId(props, defaultId, setId) {
			const id = resolveRenderedId(props, defaultId);
			const registeredId = id === defaultId ? void 0 : id;
			return [id, react.useCallback((element) => setId?.(element ? registeredId : void 0), [registeredId, setId])];
		}
		//#endregion
		//#region node_modules/.pnpm/@base-ui+react@1.9.0_@date-fns+tz@1.5.0_@types+react@18.3.31_date-fns@4.4.0_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/react/internals/resolvePopupLabel.mjs
		function resolvePopupLabel(props, activeTriggerElement, activeTriggerId) {
			const render = unwrapLazyRenderProp(props.render);
			const renderedElementProps = /*#__PURE__*/ react.isValidElement(render) ? render.props : void 0;
			const ariaLabel = props["aria-label"] ?? renderedElementProps?.["aria-label"];
			let ariaLabelledBy = props["aria-labelledby"] ?? renderedElementProps?.["aria-labelledby"];
			if (ariaLabelledBy == null && !ariaLabel) ariaLabelledBy = activeTriggerElement ? activeTriggerElement.id || void 0 : activeTriggerId || void 0;
			return ariaLabelledBy;
		}
		//#endregion
		//#region node_modules/.pnpm/@base-ui+react@1.9.0_@date-fns+tz@1.5.0_@types+react@18.3.31_date-fns@4.4.0_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/react/menu/popup/MenuPopup.mjs
		/**
		* @internal
		*/
		const MenuPopupPlain = /*#__PURE__*/ react.forwardRef(function MenuPopupPlain(componentProps, forwardedRef) {
			const { render, className, style, finalFocus, id: idProp, initialFocus: initialFocusProp, ...elementProps } = componentProps;
			const { store, defaultFloatingId, setRenderedFloatingId, virtualFocus, orientation } = useMenuRootContext();
			const inheritedSubmenuRootContext = useMenuSubmenuRootContext();
			const { side, align } = useMenuPositionerContext();
			const insideToolbar = useToolbarRootContext(true) != null;
			const open = store.useState("open");
			const transitionStatus = store.useState("transitionStatus");
			const popupProps = store.useState("popupProps");
			const mounted = store.useState("mounted");
			const instantType = store.useState("instantType");
			const activeTriggerElement = store.useState("activeTriggerElement");
			const parent = store.useState("parent");
			const lastOpenChangeReason = store.useState("lastOpenChangeReason");
			const rootId = store.useState("rootId");
			const floatingContext = store.useState("floatingRootContext");
			const floatingTreeRoot = store.useState("floatingTreeRoot");
			const closeDelay = store.useState("closeDelay");
			const hoverEnabled = store.useState("hoverEnabled");
			const disabled = store.useState("disabled");
			const openMethod = store.useState("openMethod");
			const activeTriggerId = store.useState("activeTriggerId");
			const listElement = store.useState("listElement");
			const [id, registerIdRef] = useRenderedId(componentProps, defaultFloatingId, setRenderedFloatingId);
			const ariaLabelledBy = resolvePopupLabel(componentProps, activeTriggerElement, activeTriggerId);
			const submenuRootContext = parent.type === "menu" ? inheritedSubmenuRootContext : void 0;
			const isContextMenu = parent.type === "context-menu";
			let initialFocus = initialFocusProp ?? parent.type !== "menu";
			if (initialFocusProp === void 0 && listElement && parent.type !== "menu") initialFocus = () => {
				if (store.state.activeIndex !== null) return false;
				return listElement;
			};
			useOpenChangeComplete({
				open,
				ref: store.context.popupRef,
				onComplete() {
					if (open) store.context.onOpenChangeComplete?.(true);
				}
			});
			react.useEffect(() => {
				function handleClose(event) {
					store.setOpen(false, createChangeEventDetails(event.reason, event.domEvent));
				}
				floatingTreeRoot.events.on("close", handleClose);
				return () => {
					floatingTreeRoot.events.off("close", handleClose);
				};
			}, [floatingTreeRoot.events, store]);
			useHoverFloatingInteraction(floatingContext, {
				enabled: hoverEnabled && !disabled && !isContextMenu && parent.type !== "menubar",
				closeDelay
			});
			const setPopupElement = store.useStateSetter("popupElement");
			const { parentVirtualFocusRef, handleFocus } = (react.useContext(MenuFilterImplContext)?.useParentHandoff ?? useNoParentHandoff)(store, parent, open, virtualFocus);
			const element = useRenderElement("div", componentProps, {
				state: {
					transitionStatus,
					side,
					align,
					open,
					nested: parent.type === "menu",
					instant: instantType
				},
				ref: [
					forwardedRef,
					store.context.popupRef,
					setPopupElement,
					registerIdRef
				],
				stateAttributesMapping: popupTransitionStateMapping,
				props: [
					popupProps,
					{
						id,
						...listElement ? { role: "presentation" } : {
							role: "menu",
							"aria-orientation": orientation === "horizontal" ? "horizontal" : void 0,
							"aria-labelledby": ariaLabelledBy
						},
						onKeyDown(event) {
							submenuRootContext?.onPopupKeyDown?.(event);
							if (insideToolbar && COMPOSITE_KEYS.has(event.key)) event.stopPropagation();
						},
						onFocus: handleFocus
					},
					getDisabledMountTransitionStyles(transitionStatus),
					elementProps,
					{ "data-rootownerid": rootId }
				]
			});
			let returnFocus = parent.type === void 0 || isContextMenu;
			if (activeTriggerElement || parent.type === "menubar" && lastOpenChangeReason !== "outside-press") returnFocus = true;
			const dynamicReturnFocus = submenuRootContext?.getReturnElement ?? parentVirtualFocusRef;
			return /*#__PURE__*/ (0, react_jsx_runtime.jsx)(FloatingFocusManager, {
				context: floatingContext,
				openInteractionType: openMethod,
				modal: isContextMenu,
				disabled: !mounted,
				returnFocus: finalFocus ?? dynamicReturnFocus ?? returnFocus,
				explicitReturnFocus: finalFocus === void 0 && dynamicReturnFocus ? false : void 0,
				initialFocus,
				restoreFocus: true,
				getInsideElements: parent.type === void 0 ? () => [store.context.beforeTriggerFocusGuardRef.current] : void 0,
				externalTree: parent.type !== "menubar" ? floatingTreeRoot : void 0,
				previousFocusableElement: activeTriggerElement,
				nextFocusableElement: parent.type === void 0 ? store.context.triggerFocusTargetRef : void 0,
				beforeContentFocusGuardRef: store.context.beforeContentFocusGuardRef,
				children: element
			});
		});
		const NO_PARENT_HANDOFF = {
			parentVirtualFocusRef: void 0,
			handleFocus: void 0
		};
		function useNoParentHandoff() {
			return NO_PARENT_HANDOFF;
		}
		/**
		* A container for the menu items.
		* Renders a `<div>` element.
		*
		* Documentation: [Base UI Menu](https://base-ui.com/react/components/menu)
		*/
		const MenuPopup = /*#__PURE__*/ react.forwardRef(function MenuPopup(props, forwardedRef) {
			const Popup = useMenuFilterImpl()?.Popup ?? MenuPopupPlain;
			return /*#__PURE__*/ (0, react_jsx_runtime.jsx)(Popup, {
				...props,
				ref: forwardedRef
			});
		});
		//#endregion
		//#region node_modules/.pnpm/@base-ui+react@1.9.0_@date-fns+tz@1.5.0_@types+react@18.3.31_date-fns@4.4.0_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/react/menu/portal/MenuPortalContext.mjs
		const MenuPortalContext = /*#__PURE__*/ react.createContext(void 0);
		function useMenuPortalContext() {
			const value = react.useContext(MenuPortalContext);
			if (value === void 0) throw new Error(formatErrorMessage(32));
			return value;
		}
		//#endregion
		//#region node_modules/.pnpm/@base-ui+react@1.9.0_@date-fns+tz@1.5.0_@types+react@18.3.31_date-fns@4.4.0_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/react/menu/portal/MenuPortal.mjs
		/**
		* A portal element that moves the popup to a different part of the DOM.
		* By default, the portal element is appended to `<body>`.
		* Renders a `<div>` element.
		*
		* Documentation: [Base UI Menu](https://base-ui.com/react/components/menu)
		*/
		const MenuPortal = /*#__PURE__*/ react.forwardRef(function MenuPortal(props, forwardedRef) {
			const { keepMounted = false, ...portalProps } = props;
			const { store, parent } = useMenuRootContext();
			if (!(store.useState("mounted") || keepMounted)) return null;
			const portalOwnerRole = parent.type === "menu" || parent.type === "menubar" ? "group" : void 0;
			return /*#__PURE__*/ (0, react_jsx_runtime.jsx)(MenuPortalContext.Provider, {
				value: keepMounted,
				children: /*#__PURE__*/ (0, react_jsx_runtime.jsx)(FloatingPortal, {
					ref: forwardedRef,
					...portalProps,
					portalOwnerRole
				})
			});
		});
		//#endregion
		//#region node_modules/.pnpm/@base-ui+react@1.9.0_@date-fns+tz@1.5.0_@types+react@18.3.31_date-fns@4.4.0_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/react/internals/composite/list/CompositeList.mjs
		/**
		* Provides context for a list of items in a composite component.
		*/
		function CompositeList(props) {
			const { children, elementsRef, labelsRef, onMapChange: onMapChangeProp } = props;
			const onMapChange = useStableCallback(onMapChangeProp);
			const [, setMapTick] = react.useState(0);
			const listeners = useRefWithInit(createListeners).current;
			const map = useRefWithInit(createMap).current;
			const nextIndexRef = react.useRef(0);
			const isDirtyRef = react.useRef(true);
			const itemsRef = react.useRef(null);
			const mutationObserverRef = react.useRef(null);
			const scheduleMapUpdate = useStableCallback(() => {
				if (isDirtyRef.current) return;
				isDirtyRef.current = true;
				setMapTick((tick) => tick + 1);
			});
			const register = useStableCallback((node, registration) => {
				map.set(node, registration);
				scheduleMapUpdate();
			});
			const unregister = useStableCallback((node) => {
				map.delete(node);
				scheduleMapUpdate();
			});
			const syncRefs = useStableCallback((items) => {
				const nextMap = /* @__PURE__ */ new Map();
				elementsRef.current.length = 0;
				if (labelsRef) labelsRef.current.length = 0;
				items.forEach((item) => {
					nextMap.set(item.element, {
						...item.registration.metadata ?? {},
						index: item.index
					});
					elementsRef.current[item.index] = item.element;
					if (labelsRef) labelsRef.current[item.index] = item.registration.label !== void 0 ? item.registration.label : item.registration.textRef?.current?.textContent ?? item.element.textContent;
				});
				nextIndexRef.current = elementsRef.current.length;
				return nextMap;
			});
			function observe(sortedNodes) {
				mutationObserverRef.current?.disconnect();
				mutationObserverRef.current = null;
				if (typeof MutationObserver !== "function" || sortedNodes.length < 2) return;
				const mutationObserver = new MutationObserver((entries) => {
					if (!hasMovedNode(entries)) return;
					let previousConnectedNode = null;
					for (const node of sortedNodes) {
						if (!node.isConnected) continue;
						if (previousConnectedNode && sortByDocumentPosition(previousConnectedNode, node) > 0) {
							mutationObserver.disconnect();
							scheduleMapUpdate();
							return;
						}
						previousConnectedNode = node;
					}
				});
				mutationObserverRef.current = mutationObserver;
				const roots = /* @__PURE__ */ new Set();
				for (let i = 1; i < sortedNodes.length; i += 1) {
					const root = getCommonAncestor(sortedNodes[i - 1], sortedNodes[i]);
					if (root) roots.add(root);
				}
				roots.forEach((root) => mutationObserver.observe(root, { childList: true }));
			}
			const flush = useStableCallback(() => {
				const [items, automaticNodes] = getCompositeListSnapshot(map);
				const nextMap = syncRefs(items);
				const previousItems = itemsRef.current;
				const changed = !previousItems || previousItems.length !== items.length || items.some((item, index) => {
					const previousItem = previousItems[index];
					return item.index !== previousItem.index || item.element !== previousItem.element || item.registration.index !== previousItem.registration.index || item.registration.metadata !== previousItem.registration.metadata;
				});
				observe(automaticNodes);
				itemsRef.current = items;
				isDirtyRef.current = false;
				if (!changed) return;
				listeners.forEach((listener) => listener(nextMap));
				onMapChange(nextMap);
			});
			useIsoLayoutEffect(() => {
				if (!isDirtyRef.current && itemsRef.current) syncRefs(itemsRef.current);
				return () => {
					elementsRef.current = [];
					if (labelsRef) labelsRef.current = [];
				};
			}, [
				elementsRef,
				labelsRef,
				syncRefs
			]);
			useIsoLayoutEffect(() => {
				if (isDirtyRef.current) flush();
			});
			useIsoLayoutEffect(() => {
				return () => {
					mutationObserverRef.current?.disconnect();
					isDirtyRef.current = true;
				};
			}, []);
			const subscribeMapChange = useStableCallback((fn) => {
				listeners.add(fn);
				return () => {
					listeners.delete(fn);
				};
			});
			const contextValue = react.useMemo(() => ({
				register,
				unregister,
				subscribeMapChange,
				nextIndexRef
			}), [
				register,
				unregister,
				subscribeMapChange,
				nextIndexRef
			]);
			return /*#__PURE__*/ (0, react_jsx_runtime.jsx)(CompositeListContext.Provider, {
				value: contextValue,
				children
			});
		}
		function createMap() {
			return /* @__PURE__ */ new Map();
		}
		function createListeners() {
			return /* @__PURE__ */ new Set();
		}
		function getCompositeListSnapshot(map) {
			const reservedIndices = /* @__PURE__ */ new Set();
			const items = [];
			const automaticItems = [];
			map.forEach((registration, node) => {
				if (!node.isConnected) return;
				const index = registration.index;
				const item = {
					index: index ?? -1,
					element: node,
					registration
				};
				if (index === null) automaticItems.push(item);
				else if (index >= 0) {
					reservedIndices.add(index);
					items.push(item);
				}
			});
			let nextAutomaticIndex = 0;
			automaticItems.sort((a, b) => sortByDocumentPosition(a.element, b.element));
			automaticItems.forEach((item) => {
				while (reservedIndices.has(nextAutomaticIndex)) nextAutomaticIndex += 1;
				item.index = nextAutomaticIndex;
				items.push(item);
				nextAutomaticIndex += 1;
			});
			if (reservedIndices.size > 0) items.sort((a, b) => a.index - b.index);
			return [items, automaticItems.map((item) => item.element)];
		}
		function getCommonAncestor(firstNode, lastNode) {
			let ancestor = firstNode.parentElement;
			while (ancestor && !ancestor.contains(lastNode)) ancestor = ancestor.parentElement;
			return ancestor;
		}
		function hasMovedNode(entries) {
			for (const entry of entries) for (let i = 0; i < entry.removedNodes.length; i += 1) if (entry.removedNodes[i].isConnected) return true;
			return false;
		}
		function sortByDocumentPosition(a, b) {
			if (a.nextElementSibling === b) return -1;
			if (b.nextElementSibling === a) return 1;
			return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
		}
		//#endregion
		//#region node_modules/.pnpm/@base-ui+react@1.9.0_@date-fns+tz@1.5.0_@types+react@18.3.31_date-fns@4.4.0_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/react/utils/InternalBackdrop.mjs
		/**
		* @internal
		*/
		const InternalBackdrop = /*#__PURE__*/ react.forwardRef(function InternalBackdrop(props, ref) {
			const { cutout, ...otherProps } = props;
			let clipPath;
			if (cutout) {
				const rect = cutout.getBoundingClientRect();
				clipPath = `polygon(0% 0%,100% 0%,100% 100%,0% 100%,0% 0%,${rect.left}px ${rect.top}px,${rect.left}px ${rect.bottom}px,${rect.right}px ${rect.bottom}px,${rect.right}px ${rect.top}px,${rect.left}px ${rect.top}px)`;
			}
			return /*#__PURE__*/ (0, react_jsx_runtime.jsx)("div", {
				ref,
				role: "presentation",
				"data-base-ui-inert": "",
				...otherProps,
				style: {
					position: "fixed",
					inset: 0,
					userSelect: "none",
					WebkitUserSelect: "none",
					clipPath
				}
			});
		});
		//#endregion
		//#region node_modules/.pnpm/@base-ui+react@1.9.0_@date-fns+tz@1.5.0_@types+react@18.3.31_date-fns@4.4.0_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/react/internals/useTriggerSwitchTransition.mjs
		/**
		* Popover and Menu declare different `instantType` unions, so only the members
		* this hook touches are typed.
		*/
		/**
		* Lets the positioner animate while a popup moves between detached triggers.
		*
		* The positioner is normally marked instant, so a hand-off from one trigger to
		* another would teleport. Clearing `instantType` for the duration of the move
		* lets it transition, and `trigger-change` is restored once the move finishes.
		*
		* The restoration is deferred until the move's animations finish, so it can
		* outlive the move that scheduled it. The trigger element is retained through
		* the exit transition, so a close alone does not change `domReference` and
		* nothing would otherwise re-run this effect to abort it — a popup that closes
		* and reopens on the same trigger mid-exit would inherit the stale callback and
		* lose its own transition. Closing therefore cancels the pending restoration
		* explicitly.
		*
		* Applying `trigger-change` to a closed popup is prevented separately, by the
		* stores' `instantType` selector, since a controlled `open={false}` commit
		* reaches the popup without passing through `setOpen`.
		*/
		function useTriggerSwitchTransition(parameters) {
			const { store, domReference, positionerElement, open } = parameters;
			const previousTriggerRef = react.useRef(null);
			const pendingSwitchRef = react.useRef(null);
			const runOnceAnimationsFinish = useAnimationsFinished(positionerElement);
			useIsoLayoutEffect(() => {
				if (open) return;
				pendingSwitchRef.current?.abort();
				pendingSwitchRef.current = null;
				if (store.state.instantType === "trigger-change") store.set("instantType", void 0);
			}, [open, store]);
			useIsoLayoutEffect(() => {
				const currentTrigger = domReference;
				const previousTrigger = previousTriggerRef.current;
				if (currentTrigger) previousTriggerRef.current = currentTrigger;
				if (!previousTrigger || !currentTrigger || currentTrigger === previousTrigger) return;
				if (!store.select("open")) return;
				store.set("instantType", void 0);
				const abortController = new AbortController();
				pendingSwitchRef.current = abortController;
				runOnceAnimationsFinish(() => {
					if (store.select("open")) store.set("instantType", "trigger-change");
				}, abortController.signal);
				return () => {
					abortController.abort();
				};
			}, [
				domReference,
				runOnceAnimationsFinish,
				store
			]);
		}
		//#endregion
		//#region node_modules/.pnpm/@base-ui+utils@0.5.0_@types+react@18.3.31_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/utils/useScrollLock.mjs
		let originalHtmlStyles = {};
		let originalBodyStyles = {};
		let originalHtmlScrollBehavior = "";
		function getViewportScroller(html, body) {
			return isOverflowElement(html) ? html : body;
		}
		function isPageScrollLocked(win, html, body) {
			return /hidden|clip/.test(win.getComputedStyle(getViewportScroller(html, body)).overflowY);
		}
		function hasInsetScrollbars(referenceElement) {
			if (typeof document === "undefined") return false;
			const doc = ownerDocument(referenceElement);
			return getWindow(doc).innerWidth - doc.documentElement.clientWidth > 0;
		}
		function supportsStableScrollbarGutter(referenceElement) {
			if (!(typeof CSS !== "undefined" && CSS.supports && CSS.supports("scrollbar-gutter", "stable")) || typeof document === "undefined") return false;
			const doc = ownerDocument(referenceElement);
			const html = doc.documentElement;
			const body = doc.body;
			const scrollContainer = getViewportScroller(html, body);
			const originalScrollContainerOverflowY = scrollContainer.style.overflowY;
			const originalHtmlStyleGutter = html.style.scrollbarGutter;
			html.style.scrollbarGutter = "stable";
			scrollContainer.style.overflowY = "scroll";
			const before = scrollContainer.offsetWidth;
			scrollContainer.style.overflowY = "hidden";
			const after = scrollContainer.offsetWidth;
			scrollContainer.style.overflowY = originalScrollContainerOverflowY;
			html.style.scrollbarGutter = originalHtmlStyleGutter;
			return before === after;
		}
		function preventScrollOverlayScrollbars(referenceElement) {
			const doc = ownerDocument(referenceElement);
			const html = doc.documentElement;
			const body = doc.body;
			const elementToLock = getViewportScroller(html, body);
			const originalElementToLockStyles = {
				overflowY: elementToLock.style.overflowY,
				overflowX: elementToLock.style.overflowX
			};
			Object.assign(elementToLock.style, {
				overflowY: "hidden",
				overflowX: "hidden"
			});
			return () => {
				Object.assign(elementToLock.style, originalElementToLockStyles);
			};
		}
		function preventScrollInsetScrollbars(referenceElement) {
			const doc = ownerDocument(referenceElement);
			const html = doc.documentElement;
			const body = doc.body;
			const win = getWindow(html);
			let scrollTop = 0;
			let scrollLeft = 0;
			let updateGutterOnly = false;
			const resizeFrame = AnimationFrame.create();
			if (webkit && (win.visualViewport?.scale ?? 1) !== 1) return () => {};
			function lockScroll() {
				const htmlStyles = win.getComputedStyle(html);
				const bodyStyles = win.getComputedStyle(body);
				const scrollbarGutterValue = (htmlStyles.scrollbarGutter || "").includes("both-edges") ? "stable both-edges" : "stable";
				scrollTop = html.scrollTop;
				scrollLeft = html.scrollLeft;
				originalHtmlStyles = {
					scrollbarGutter: html.style.scrollbarGutter,
					overflowY: html.style.overflowY,
					overflowX: html.style.overflowX
				};
				originalHtmlScrollBehavior = html.style.scrollBehavior;
				originalBodyStyles = {
					position: body.style.position,
					height: body.style.height,
					width: body.style.width,
					boxSizing: body.style.boxSizing,
					overflowY: body.style.overflowY,
					overflowX: body.style.overflowX,
					scrollBehavior: body.style.scrollBehavior
				};
				const isScrollableY = html.scrollHeight > html.clientHeight;
				const isScrollableX = html.scrollWidth > html.clientWidth;
				const hasConstantOverflowY = htmlStyles.overflowY === "scroll" || bodyStyles.overflowY === "scroll";
				const hasConstantOverflowX = htmlStyles.overflowX === "scroll" || bodyStyles.overflowX === "scroll";
				const scrollbarWidth = Math.max(0, win.innerWidth - body.clientWidth);
				const scrollbarHeight = Math.max(0, win.innerHeight - body.clientHeight);
				const marginY = parseFloat(bodyStyles.marginTop) + parseFloat(bodyStyles.marginBottom);
				const marginX = parseFloat(bodyStyles.marginLeft) + parseFloat(bodyStyles.marginRight);
				const elementToLock = getViewportScroller(html, body);
				updateGutterOnly = supportsStableScrollbarGutter(referenceElement);
				if (updateGutterOnly) {
					html.style.scrollbarGutter = scrollbarGutterValue;
					elementToLock.style.overflowY = "hidden";
					elementToLock.style.overflowX = "hidden";
					return;
				}
				Object.assign(html.style, {
					scrollbarGutter: scrollbarGutterValue,
					overflowY: "hidden",
					overflowX: "hidden"
				});
				if (isScrollableY || hasConstantOverflowY) html.style.overflowY = "scroll";
				if (isScrollableX || hasConstantOverflowX) html.style.overflowX = "scroll";
				Object.assign(body.style, {
					position: "relative",
					height: marginY || scrollbarHeight ? `calc(100dvh - ${marginY + scrollbarHeight}px)` : "100dvh",
					width: marginX || scrollbarWidth ? `calc(100vw - ${marginX + scrollbarWidth}px)` : "100vw",
					boxSizing: "border-box",
					overflowY: "hidden",
					overflowX: "hidden",
					scrollBehavior: "unset"
				});
				body.scrollTop = scrollTop;
				body.scrollLeft = scrollLeft;
				html.setAttribute("data-base-ui-scroll-locked", "");
				html.style.scrollBehavior = "unset";
			}
			function cleanup() {
				Object.assign(html.style, originalHtmlStyles);
				Object.assign(body.style, originalBodyStyles);
				if (!updateGutterOnly) {
					html.scrollTop = scrollTop;
					html.scrollLeft = scrollLeft;
					html.removeAttribute("data-base-ui-scroll-locked");
					html.style.scrollBehavior = originalHtmlScrollBehavior;
				}
			}
			function handleResize() {
				cleanup();
				resizeFrame.request(lockScroll);
			}
			lockScroll();
			const unsubscribeResize = addEventListener(win, "resize", handleResize);
			return () => {
				resizeFrame.cancel();
				cleanup();
				if (typeof win.removeEventListener === "function") unsubscribeResize();
			};
		}
		var ScrollLocker = class {
			lockCount = 0;
			restore = null;
			timeoutLock = Timeout.create();
			timeoutUnlock = Timeout.create();
			acquire(referenceElement) {
				this.lockCount += 1;
				if (this.lockCount === 1 && this.restore === null) this.timeoutLock.start(0, () => this.lock(referenceElement));
				return this.release;
			}
			release = () => {
				this.lockCount -= 1;
				if (this.lockCount === 0 && this.restore) this.timeoutUnlock.start(0, this.unlock);
			};
			unlock = () => {
				if (this.lockCount === 0 && this.restore) {
					this.restore?.();
					this.restore = null;
				}
			};
			lock(referenceElement) {
				if (this.lockCount === 0 || this.restore !== null) return;
				const doc = ownerDocument(referenceElement);
				const html = doc.documentElement;
				const body = doc.body;
				const win = getWindow(html);
				if (isPageScrollLocked(win, html, body)) {
					const observer = new win.MutationObserver(() => {
						if (isPageScrollLocked(win, html, body)) return;
						observer.disconnect();
						this.restore = null;
						this.lock(referenceElement);
					});
					const options = { attributes: true };
					observer.observe(html, options);
					observer.observe(body, options);
					this.restore = () => observer.disconnect();
					return;
				}
				const hasOverlayScrollbars = ios || !hasInsetScrollbars(referenceElement);
				this.restore = hasOverlayScrollbars ? preventScrollOverlayScrollbars(referenceElement) : preventScrollInsetScrollbars(referenceElement);
			}
		};
		const SCROLL_LOCKER = new ScrollLocker();
		/**
		* Locks the scroll of the document when enabled.
		*
		* @param enabled - Whether to enable the scroll lock.
		* @param referenceElement - Element to use as a reference for lock calculations.
		*/
		function useScrollLock(enabled = true, referenceElement = null) {
			useIsoLayoutEffect(() => {
				if (!enabled) return;
				return SCROLL_LOCKER.acquire(referenceElement);
			}, [enabled, referenceElement]);
		}
		//#endregion
		//#region node_modules/.pnpm/@base-ui+react@1.9.0_@date-fns+tz@1.5.0_@types+react@18.3.31_date-fns@4.4.0_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/react/utils/useAnchoredPopupScrollLock.mjs
		const VIEWPORT_WIDTH_TOLERANCE_PX = 20;
		/**
		* Manages scroll lock for anchored popups. For non-touch opens, scroll lock is applied when
		* enabled. For touch opens, scroll lock is applied only when the positioner width is effectively
		* viewport-sized.
		*/
		function useAnchoredPopupScrollLock(enabled, touchOpen, positionerElement, referenceElement) {
			const [touchOpenShouldLockScroll, setTouchOpenShouldLockScroll] = react.useState(false);
			useIsoLayoutEffect(() => {
				if (!enabled || !touchOpen || positionerElement == null) {
					setTouchOpenShouldLockScroll(false);
					return;
				}
				const viewportWidth = ownerDocument(positionerElement).documentElement.clientWidth;
				const popupWidth = positionerElement.offsetWidth;
				setTouchOpenShouldLockScroll(viewportWidth > 0 && popupWidth > 0 && popupWidth >= viewportWidth - VIEWPORT_WIDTH_TOLERANCE_PX);
			}, [
				enabled,
				touchOpen,
				positionerElement
			]);
			useScrollLock(enabled && (!touchOpen || touchOpenShouldLockScroll), referenceElement);
		}
		//#endregion
		//#region node_modules/.pnpm/@base-ui+react@1.9.0_@date-fns+tz@1.5.0_@types+react@18.3.31_date-fns@4.4.0_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/react/menu/positioner/MenuPositioner.mjs
		/**
		* Positions the menu popup against the trigger.
		* Renders a `<div>` element.
		*
		* Documentation: [Base UI Menu](https://base-ui.com/react/components/menu)
		*/
		const MenuPositioner = /*#__PURE__*/ react.forwardRef(function MenuPositioner(componentProps, forwardedRef) {
			const { anchor: anchorProp, positionMethod: positionMethodProp = "absolute", className, render, side, align: alignProp, sideOffset: sideOffsetProp = 0, alignOffset: alignOffsetProp = 0, collisionBoundary = "clipping-ancestors", collisionPadding = 5, arrowPadding = 5, sticky = false, disableAnchorTracking = false, collisionAvoidance: collisionAvoidanceProp = DROPDOWN_COLLISION_AVOIDANCE, style, ...elementProps } = componentProps;
			const { store, virtualFocus, syncHighlightedItem } = useMenuRootContext();
			const keepMounted = useMenuPortalContext();
			const contextMenuContext = useContextMenuRootContext(true);
			const parent = store.useState("parent");
			const floatingRootContext = store.useState("floatingRootContext");
			const floatingTreeRoot = store.useState("floatingTreeRoot");
			const mounted = store.useState("mounted");
			const open = store.useState("open");
			const modal = store.useState("modal");
			const openMethod = store.useState("openMethod");
			const triggerElement = store.useState("activeTriggerElement");
			const transitionStatus = store.useState("transitionStatus");
			const positionerElement = store.useState("positionerElement");
			const instantType = store.useState("instantType");
			const adaptiveOrigin = store.useState("adaptiveOrigin");
			const lastOpenChangeReason = store.useState("lastOpenChangeReason");
			const floatingNodeId = store.useState("floatingNodeId");
			const floatingParentNodeId = store.useState("floatingParentNodeId");
			const domReference = floatingRootContext.useState("domReferenceElement");
			let anchor = anchorProp;
			let sideOffset = sideOffsetProp;
			let alignOffset = alignOffsetProp;
			let align = alignProp;
			let collisionAvoidance = collisionAvoidanceProp;
			if (parent.type === "context-menu") {
				anchor = anchorProp ?? parent.context?.anchor;
				align = align ?? "start";
				if (!side && align !== "center") {
					alignOffset = componentProps.alignOffset ?? 2;
					sideOffset = componentProps.sideOffset ?? -5;
				}
			}
			let computedSide = side;
			let computedAlign = align;
			if (parent.type === "menu") {
				computedSide = computedSide ?? "inline-end";
				computedAlign = computedAlign ?? "start";
				collisionAvoidance = componentProps.collisionAvoidance ?? POPUP_COLLISION_AVOIDANCE;
			} else if (parent.type === "menubar") {
				computedSide = computedSide ?? (parent.context.orientation === "vertical" ? "inline-end" : "bottom");
				computedAlign = computedAlign ?? "start";
			}
			const contextMenu = parent.type === "context-menu";
			const positioner = useAnchorPositioning({
				anchor,
				floatingRootContext,
				positionMethod: contextMenuContext ? "fixed" : positionMethodProp,
				mounted,
				side: computedSide,
				sideOffset,
				align: computedAlign,
				alignOffset,
				arrowPadding: contextMenu ? 0 : arrowPadding,
				collisionBoundary,
				collisionPadding,
				sticky,
				nodeId: floatingNodeId,
				keepMounted,
				disableAnchorTracking,
				collisionAvoidance,
				shift: contextMenu ? {
					crossAxis: !("side" in collisionAvoidance && collisionAvoidance.side === "flip"),
					rootBoundary: "layoutViewport"
				} : void 0,
				externalTree: floatingTreeRoot,
				adaptiveOrigin,
				lazyFlip: virtualFocus ? "placement" : false
			});
			react.useEffect(() => {
				function onMenuOpenChange(details) {
					if (details.open) {
						if (details.parentNodeId === floatingNodeId) store.set("hoverEnabled", false);
						if (details.nodeId !== floatingNodeId && details.parentNodeId === store.select("floatingParentNodeId")) store.setOpen(false, createChangeEventDetails(siblingOpen));
					}
				}
				floatingTreeRoot.events.on("menuopenchange", onMenuOpenChange);
				return () => {
					floatingTreeRoot.events.off("menuopenchange", onMenuOpenChange);
				};
			}, [
				store,
				floatingTreeRoot.events,
				floatingNodeId
			]);
			react.useEffect(() => {
				if (store.select("floatingParentNodeId") == null) return;
				function onParentClose(details) {
					if (details.open || details.nodeId !== store.select("floatingParentNodeId")) return;
					const reason = details.reason ?? "sibling-open";
					store.setOpen(false, createChangeEventDetails(reason));
				}
				floatingTreeRoot.events.on("menuopenchange", onParentClose);
				return () => {
					floatingTreeRoot.events.off("menuopenchange", onParentClose);
				};
			}, [floatingTreeRoot.events, store]);
			const closeTimeout = useTimeout();
			react.useEffect(() => {
				if (!open) closeTimeout.clear();
			}, [open, closeTimeout]);
			react.useEffect(() => {
				function onItemHover(event) {
					if (!open || event.nodeId !== store.select("floatingParentNodeId")) return;
					if (event.target && triggerElement && triggerElement !== event.target) {
						const delay = store.select("closeDelay");
						if (delay > 0) {
							if (!closeTimeout.isStarted()) closeTimeout.start(delay, () => {
								store.setOpen(false, createChangeEventDetails(siblingOpen));
							});
						} else store.setOpen(false, createChangeEventDetails(siblingOpen));
					} else closeTimeout.clear();
				}
				floatingTreeRoot.events.on("itemhover", onItemHover);
				return () => {
					floatingTreeRoot.events.off("itemhover", onItemHover);
				};
			}, [
				floatingTreeRoot.events,
				open,
				triggerElement,
				store,
				closeTimeout
			]);
			react.useEffect(() => {
				const eventDetails = {
					open,
					nodeId: floatingNodeId,
					parentNodeId: floatingParentNodeId,
					reason: store.select("lastOpenChangeReason")
				};
				floatingTreeRoot.events.emit("menuopenchange", eventDetails);
			}, [
				floatingTreeRoot.events,
				open,
				store,
				floatingNodeId,
				floatingParentNodeId
			]);
			useTriggerSwitchTransition({
				store,
				domReference,
				positionerElement,
				open
			});
			const state = {
				open,
				side: positioner.side,
				align: positioner.align,
				anchorHidden: positioner.anchorHidden,
				nested: parent.type === "menu",
				instant: instantType
			};
			const menubarModal = parent.type === "menubar" && parent.context.modal;
			useAnchoredPopupScrollLock(open && (menubarModal || modal && lastOpenChangeReason !== "trigger-hover"), openMethod === "touch", positionerElement, triggerElement);
			const element = usePositioner(componentProps, state, {
				styles: positioner.positionerStyles,
				transitionStatus,
				props: elementProps,
				refs: [forwardedRef, store.useStateSetter("positionerElement")],
				hidden: !mounted,
				inert: !open
			});
			const shouldRenderBackdrop = mounted && parent.type !== "menu" && (parent.type !== "menubar" && modal && lastOpenChangeReason !== "trigger-hover" || parent.type === "menubar" && parent.context.modal);
			let backdropCutout = null;
			if (parent.type === "menubar") backdropCutout = parent.context.contentElement;
			else if (parent.type === void 0) backdropCutout = triggerElement;
			return /*#__PURE__*/ (0, react_jsx_runtime.jsxs)(MenuPositionerContext.Provider, {
				value: positioner,
				children: [shouldRenderBackdrop && /*#__PURE__*/ (0, react_jsx_runtime.jsx)(InternalBackdrop, {
					ref: parent.type === "context-menu" || parent.type === "nested-context-menu" ? parent.context.internalBackdropRef : null,
					inert: inertValue(!open),
					cutout: backdropCutout
				}), /*#__PURE__*/ (0, react_jsx_runtime.jsx)(FloatingNode, {
					id: floatingNodeId,
					children: /*#__PURE__*/ (0, react_jsx_runtime.jsx)(CompositeList, {
						elementsRef: store.context.itemDomElements,
						labelsRef: store.context.itemLabels,
						onMapChange: syncHighlightedItem,
						children: element
					})
				})]
			});
		});
		//#endregion
		//#region node_modules/.pnpm/@base-ui+react@1.9.0_@date-fns+tz@1.5.0_@types+react@18.3.31_date-fns@4.4.0_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/react/menubar/MenubarContext.mjs
		const MenubarContext = /*#__PURE__*/ react.createContext(null);
		function useMenubarContext(optional) {
			const context = react.useContext(MenubarContext);
			if (context === null && !optional) throw new Error(formatErrorMessage(5));
			return context;
		}
		//#endregion
		//#region node_modules/.pnpm/@base-ui+utils@0.5.0_@types+react@18.3.31_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/utils/useEnhancedClickHandler.mjs
		/**
		* Provides a cross-browser way to determine the type of the pointer used to click.
		* Safari and Firefox do not provide the PointerEvent to the click handler (they use MouseEvent) yet.
		* Additionally, this implementation detects if the click was triggered by the keyboard.
		*
		* @param handler The function to be called when the button is clicked. The first parameter is the original event and the second parameter is the pointer type.
		*/
		function useEnhancedClickHandler(handler) {
			const lastClickInteractionTypeRef = react.useRef("");
			const handlePointerDown = react.useCallback((event) => {
				if (event.defaultPrevented) return;
				lastClickInteractionTypeRef.current = event.pointerType;
				handler(event, event.pointerType);
			}, [handler]);
			return {
				onClick: react.useCallback((event) => {
					if (event.detail === 0) {
						handler(event, "keyboard");
						return;
					}
					if ("pointerType" in event) handler(event, event.pointerType);
					else handler(event, lastClickInteractionTypeRef.current);
					lastClickInteractionTypeRef.current = "";
				}, [handler]),
				onPointerDown: handlePointerDown
			};
		}
		//#endregion
		//#region node_modules/.pnpm/@base-ui+react@1.9.0_@date-fns+tz@1.5.0_@types+react@18.3.31_date-fns@4.4.0_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/react/internals/useValueChanged.mjs
		function useValueChanged(value, onChange) {
			const valueRef = react.useRef(value);
			const onChangeCallback = useStableCallback(onChange);
			useIsoLayoutEffect(() => {
				if (valueRef.current !== value) onChangeCallback(valueRef.current);
				valueRef.current = value;
			}, [value, onChangeCallback]);
		}
		//#endregion
		//#region node_modules/.pnpm/@base-ui+react@1.9.0_@date-fns+tz@1.5.0_@types+react@18.3.31_date-fns@4.4.0_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/react/utils/useOpenInteractionType.mjs
		function useOpenMethodTriggerProps(open, setOpenMethod) {
			const { onClick, onPointerDown } = useEnhancedClickHandler(useStableCallback((_, interactionType) => {
				if (!(typeof open === "function" ? open() : open)) setOpenMethod(interactionType || (ios ? "touch" : ""));
			}));
			return react.useMemo(() => ({
				onClick,
				onPointerDown
			}), [onClick, onPointerDown]);
		}
		/**
		* Determines the interaction type (keyboard, mouse, touch, etc.) that opened the component.
		*
		* @param open The open state of the component.
		*/
		function useOpenInteractionType(open) {
			const [openMethod, setOpenMethod] = react.useState(null);
			const triggerProps = useOpenMethodTriggerProps(open, setOpenMethod);
			useValueChanged(open, (previousOpen) => {
				if (previousOpen && !open) setOpenMethod(null);
			});
			return react.useMemo(() => ({
				openMethod,
				triggerProps
			}), [openMethod, triggerProps]);
		}
		//#endregion
		//#region node_modules/.pnpm/@base-ui+react@1.9.0_@date-fns+tz@1.5.0_@types+react@18.3.31_date-fns@4.4.0_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/react/utils/getHighlightReason.mjs
		/**
		* The `onItemHighlighted` reason for a list navigation event, matching the event type that the
		* reason promises in its details.
		*/
		function getHighlightReason(event) {
			if (event == null) return none;
			if (event.type.startsWith("key")) return keyboard;
			if (event.type.startsWith("mouse") || event.type.startsWith("pointer")) return pointer;
			return none;
		}
		//#endregion
		//#region node_modules/.pnpm/@base-ui+react@1.9.0_@date-fns+tz@1.5.0_@types+react@18.3.31_date-fns@4.4.0_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/react/menu/store/MenuStore.mjs
		const selectors = {
			...popupStoreSelectors,
			disabled: (state) => state.parent.type === "menubar" ? state.parent.context.disabled || state.disabled : state.disabled,
			modal: (state) => (state.parent.type === void 0 || state.parent.type === "context-menu") && (state.modal ?? true),
			openMethod: (state) => state.openMethod,
			keyboardOpen: (state) => state.keyboardOpen,
			allowMouseEnter: (state) => state.allowMouseEnter,
			highlightItemOnHover: (state) => state.highlightItemOnHover,
			parent: (state) => state.parent,
			rootId: (state) => {
				if (state.parent.type === "menu") return state.parent.store.select("rootId");
				return state.parent.type !== void 0 ? state.parent.context.rootId : state.rootId;
			},
			activeIndex: (state) => state.activeIndex,
			listElement: (state) => state.listElement,
			/** The trigger's `aria-controls`: the list when one holds the `menu` role, else the popup. */
			triggerControlsId: (state, triggerId) => {
				const popupId = popupStoreSelectors.triggerPopupId(state, triggerId);
				return popupId ? state.listElement?.id || popupId : void 0;
			},
			filterTriggerProps: (state) => state.filterTriggerProps,
			inputProps: (state) => state.inputProps,
			webkitAriaSelected: (state, highlighted) => webkit && state.inputFocused && highlighted ? true : void 0,
			highlightedItemId: (state) => state.highlightedItem?.id || void 0,
			isActive: (state, itemIndex) => state.activeIndex === itemIndex,
			hoverEnabled: (state) => state.hoverEnabled,
			instantType: (state) => state.instantType === "trigger-change" && !popupStoreSelectors.open(state) ? void 0 : state.instantType,
			lastOpenChangeReason: (state) => state.openChangeReason,
			floatingTreeRoot: (state) => {
				if (state.parent.type === "menu") return state.parent.store.select("floatingTreeRoot");
				return state.floatingTreeRoot;
			},
			floatingNodeId: (state) => state.floatingNodeId,
			floatingParentNodeId: (state) => state.floatingParentNodeId,
			itemProps: (state) => state.itemProps,
			closeDelay: (state) => state.closeDelay,
			adaptiveOrigin: (state) => state.adaptiveOrigin,
			keyboardEventRelay: (state) => {
				if (state.keyboardEventRelay) return state.keyboardEventRelay;
				if (state.parent.type === "menu") return state.parent.store.select("keyboardEventRelay");
			}
		};
		/**
		* The store view that detached handle-backed triggers read from. Both the real `MenuStore` and the
		* inert fallback store satisfy it, so a trigger can read from whichever store the handle currently
		* exposes. Narrowed to the members a trigger actually uses — the trigger-data members plus `setOpen`
		* (called by the focus guards) — so the exposed surface can't bypass the open-change pipeline; on
		* the detached fallback store every one of these mutations is a no-op.
		*/
		var MenuStore = class extends ReactStore {
			constructor(initialState, floatingId, nested = false) {
				const triggerElements = new PopupTriggerMap();
				const state = createInitialState(triggerElements, floatingId, nested, initialState);
				super(state, createInitialContext(triggerElements), selectors);
				this.observe("parent", (parent) => {
					if (parent.type === "menu") this.context.allowMouseUpTriggerRef = parent.store.context.allowMouseUpTriggerRef;
					else if (parent.type !== void 0) this.context.allowMouseUpTriggerRef = parent.context.allowMouseUpTriggerRef;
				});
			}
			/**
			* Propagates changes of the parent menu's shared tree state to this store's subscribers.
			* The owning `Menu.Root` calls it from an effect so the parent store subscription is released
			* when the submenu unmounts.
			* @returns A function that removes the parent store subscription.
			*/
			subscribeToParentMenu() {
				const parent = this.state.parent;
				if (parent.type !== "menu") return;
				let rootId = parent.store.select("rootId");
				let floatingTreeRoot = parent.store.select("floatingTreeRoot");
				let keyboardEventRelay = parent.store.select("keyboardEventRelay");
				return parent.store.subscribe(() => {
					const nextRootId = parent.store.select("rootId");
					const nextFloatingTreeRoot = parent.store.select("floatingTreeRoot");
					const nextKeyboardEventRelay = parent.store.select("keyboardEventRelay");
					if (rootId === nextRootId && floatingTreeRoot === nextFloatingTreeRoot && keyboardEventRelay === nextKeyboardEventRelay) return;
					rootId = nextRootId;
					floatingTreeRoot = nextFloatingTreeRoot;
					keyboardEventRelay = nextKeyboardEventRelay;
					this.notifyAll();
				});
			}
			setOpen(open, eventDetails) {
				this.state.floatingRootContext.context.events.emit("setOpen", {
					open,
					eventDetails
				});
			}
			setActiveIndex(activeIndex, reason, event) {
				if (this.state.activeIndex !== activeIndex) {
					const isWriteBack = (activeIndex === null ? void 0 : this.context.itemDomElements.current[activeIndex]) === this.context.reportedItem;
					this.context.highlightReason = isWriteBack ? "none" : reason;
					this.context.highlightEvent = isWriteBack ? void 0 : event;
				}
				this.set("activeIndex", activeIndex);
			}
			highlightItem(element, reason, event) {
				const index = this.context.itemDomElements.current.indexOf(element);
				if (index > -1) this.setActiveIndex(index, reason, event);
			}
		};
		function createInitialContext(triggerElements) {
			return {
				positionerRef: /*#__PURE__*/ react.createRef(),
				popupRef: /*#__PURE__*/ react.createRef(),
				typingRef: { current: false },
				itemDomElements: { current: [] },
				itemLabels: { current: [] },
				highlightReason: "none",
				highlightEvent: void 0,
				reportedItem: void 0,
				allowMouseUpTriggerRef: { current: false },
				virtualFocusRef: void 0,
				triggerFocusTargetRef: /*#__PURE__*/ react.createRef(),
				beforeTriggerFocusGuardRef: /*#__PURE__*/ react.createRef(),
				beforeContentFocusGuardRef: /*#__PURE__*/ react.createRef(),
				onOpenChangeComplete: void 0,
				triggerElements
			};
		}
		function createInitialState(triggerElements, floatingId, nested = false, initialState) {
			return {
				...createInitialPopupStoreState(triggerElements, floatingId, nested),
				disabled: false,
				modal: true,
				openMethod: null,
				keyboardOpen: false,
				allowMouseEnter: false,
				highlightItemOnHover: true,
				parent: { type: void 0 },
				rootId: void 0,
				activeIndex: null,
				listElement: null,
				filterTriggerProps: EMPTY_OBJECT,
				inputProps: EMPTY_OBJECT,
				inputFocused: false,
				highlightedItem: void 0,
				hoverEnabled: true,
				instantType: void 0,
				openChangeReason: null,
				floatingTreeRoot: new FloatingTreeStore(),
				floatingNodeId: void 0,
				floatingParentNodeId: null,
				itemProps: EMPTY_OBJECT,
				keyboardEventRelay: void 0,
				closeDelay: 0,
				adaptiveOrigin: void 0,
				...initialState
			};
		}
		//#endregion
		//#region node_modules/.pnpm/@base-ui+react@1.9.0_@date-fns+tz@1.5.0_@types+react@18.3.31_date-fns@4.4.0_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/react/menu/filter-provider/MenuFilterProviderContext.mjs
		/**
		* What `Menu.FilterProvider` hands to the root directly inside it: the filterable root
		* implementations (the provider is their only importer) and the filter props.
		*/
		/**
		* Non-null only directly below a provider. The root that consumes it resets it, so a plain
		* `Menu.SubmenuRoot` inside a filterable menu stays plain.
		*/
		const MenuFilterProviderContext = /*#__PURE__*/ react.createContext(null);
		//#endregion
		//#region node_modules/.pnpm/@base-ui+react@1.9.0_@date-fns+tz@1.5.0_@types+react@18.3.31_date-fns@4.4.0_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/react/menu/utils/isKeyboardOpen.mjs
		/**
		* Keyboard and assistive-technology activations produce `detail === 0` clicks; mouse-gesture
		* clicks (including the synthesized drag-release click from `useMenuItemCommonProps`) carry
		* `detail >= 1`.
		*/
		function isKeyboardClick(reason, event) {
			return (reason === "trigger-press" || reason === "item-press") && event?.detail === 0;
		}
		/**
		* Whether a menu opens from the keyboard, which lands focus in the popup. Arrow keys report
		* `list-navigation`; Enter and Space dispatch a click carrying no pointer detail.
		*/
		function isKeyboardOpen(reason, event) {
			return reason === "list-navigation" || isKeyboardClick(reason, event);
		}
		//#endregion
		//#region node_modules/.pnpm/@base-ui+react@1.9.0_@date-fns+tz@1.5.0_@types+react@18.3.31_date-fns@4.4.0_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/react/menu/root/MenuRoot.mjs
		/**
		* @internal
		*/
		const MenuRootInternal = fastComponent(function MenuRootInternal(props) {
			const { children, open: openProp, onOpenChange, onOpenChangeComplete, onItemHighlighted: onItemHighlightedProp, defaultOpen = false, disabled: disabledProp = false, modal: modalProp, loopFocus = true, orientation = "vertical", actionsRef, closeParentOnEsc = false, handle, triggerId: triggerIdProp, defaultTriggerId: defaultTriggerIdProp = null, highlightItemOnHover = true, isSubmenu = false, virtualFocus = false, virtualFocusRef, allowEscape = true, resetOnPointerLeave = true } = props;
			const contextMenuContext = useContextMenuRootContext(true);
			const parentMenuRootContext = useMenuRootContext(true);
			const menubarContext = useMenubarContext(true);
			const enclosingMenuStore = parentMenuRootContext?.store;
			const parentVirtualFocus = parentMenuRootContext?.virtualFocus ?? false;
			const parentFromContext = react.useMemo(() => {
				if (isSubmenu && enclosingMenuStore) return {
					type: "menu",
					store: enclosingMenuStore
				};
				if (menubarContext) return {
					type: "menubar",
					context: menubarContext
				};
				if (contextMenuContext && !enclosingMenuStore) return {
					type: "context-menu",
					context: contextMenuContext
				};
				return { type: void 0 };
			}, [
				contextMenuContext,
				enclosingMenuStore,
				menubarContext,
				isSubmenu
			]);
			const rootId = useBaseUiId();
			const defaultFloatingId = useBaseUiId();
			const [renderedFloatingId, setRenderedFloatingId] = react.useState(void 0);
			const floatingId = (renderedFloatingId ?? defaultFloatingId) || void 0;
			const floatingParentNodeIdFromContext = useFloatingParentNodeId();
			const parentMenuStore = parentFromContext.type === "menu" ? parentFromContext.store : void 0;
			const animateInitialOpen = (openProp ?? defaultOpen) && parentMenuStore?.state.transitionStatus === "starting";
			const seededInstantType = useRefWithInit(() => animateInitialOpen ? parentMenuStore?.state.instantType : void 0).current;
			const store = useRefWithInit(() => {
				const menuStore = new MenuStore({
					open: defaultOpen,
					openProp,
					activeTriggerId: defaultTriggerIdProp,
					triggerIdProp,
					parent: parentFromContext,
					disabled: disabledProp,
					highlightItemOnHover,
					modal: parentFromContext.type === void 0 ? modalProp : void 0,
					rootId,
					instantType: seededInstantType
				}, floatingId, floatingParentNodeIdFromContext != null);
				menuStore.context.virtualFocusRef = virtualFocusRef;
				return menuStore;
			}).current;
			store.useControlledProp("openProp", openProp);
			store.useControlledProp("triggerIdProp", triggerIdProp);
			store.useContextCallback("onOpenChangeComplete", onOpenChangeComplete);
			const floatingTreeRoot = store.useState("floatingTreeRoot");
			const floatingNodeIdFromContext = useFloatingNodeId(floatingTreeRoot);
			const open = store.useState("open");
			const activeTriggerElement = store.useState("activeTriggerElement");
			const positionerElement = store.useState("positionerElement");
			const hoverEnabled = store.useState("hoverEnabled");
			const disabled = store.useState("disabled");
			const lastOpenChangeReason = store.useState("lastOpenChangeReason");
			const parent = store.useState("parent");
			const activeIndex = store.useState("activeIndex");
			const keyboardOpen = store.useState("keyboardOpen");
			const payload = store.useState("payload");
			const floatingParentNodeId = store.useState("floatingParentNodeId");
			const openEventRef = react.useRef(null);
			const allowOutsidePressDismissalRef = react.useRef(parent.type !== "context-menu");
			const allowOutsidePressDismissalTimeout = useTimeout();
			const allowTouchToCloseRef = react.useRef(true);
			const allowTouchToCloseTimeout = useTimeout();
			const nested = floatingParentNodeId != null;
			const { openMethod, triggerProps: interactionTypeProps } = useOpenInteractionType(open);
			store.useSyncedValues({
				disabled: disabledProp,
				highlightItemOnHover,
				modal: parent.type === void 0 ? modalProp : void 0,
				openMethod,
				rootId
			});
			useImplicitActiveTrigger(store);
			const { forceUnmount, transitionStatus } = useOpenStateTransitions(open, store, () => {
				store.set("allowMouseEnter", false);
			}, animateInitialOpen);
			const runOnceAnimationsFinish = useAnimationsFinished(store.context.popupRef);
			react.useEffect(() => {
				if (seededInstantType === void 0) return;
				const clearSeededInstantType = () => {
					if (store.state.instantType === seededInstantType) store.set("instantType", void 0);
				};
				if (!open) {
					clearSeededInstantType();
					return;
				}
				if (transitionStatus !== void 0) return;
				if (store.context.popupRef.current == null) {
					clearSeededInstantType();
					return;
				}
				const abortController = new AbortController();
				runOnceAnimationsFinish(clearSeededInstantType, abortController.signal);
				return () => {
					abortController.abort();
				};
			}, [
				seededInstantType,
				open,
				transitionStatus,
				runOnceAnimationsFinish,
				store
			]);
			useIsoLayoutEffect(() => {
				if (contextMenuContext && !parentMenuRootContext) store.update({
					parent: {
						type: "context-menu",
						context: contextMenuContext
					},
					floatingNodeId: floatingNodeIdFromContext,
					floatingParentNodeId: floatingParentNodeIdFromContext
				});
				else if (parentMenuRootContext || !store.select("activeTriggerElement")) store.update({
					floatingNodeId: floatingNodeIdFromContext,
					floatingParentNodeId: floatingParentNodeIdFromContext
				});
			}, [
				contextMenuContext,
				parentMenuRootContext,
				floatingNodeIdFromContext,
				floatingParentNodeIdFromContext,
				activeTriggerElement,
				store
			]);
			react.useEffect(() => {
				if (!open) openEventRef.current = null;
				if (parent.type !== "context-menu") return;
				if (!open) {
					allowOutsidePressDismissalTimeout.clear();
					allowOutsidePressDismissalRef.current = false;
					return;
				}
				allowOutsidePressDismissalTimeout.start(500, () => {
					allowOutsidePressDismissalRef.current = true;
				});
			}, [
				allowOutsidePressDismissalTimeout,
				open,
				parent.type
			]);
			useIsoLayoutEffect(() => {
				if (!open && !hoverEnabled) store.set("hoverEnabled", true);
			}, [
				open,
				hoverEnabled,
				store
			]);
			const setOpen = useStableCallback((nextOpen, eventDetails) => {
				const reason = eventDetails.reason;
				if (!nextOpen && !store.select("open")) return;
				if (open === nextOpen && eventDetails.trigger === activeTriggerElement && lastOpenChangeReason === reason) return;
				const shouldPreventUnmountOnClose = attachPreventUnmountOnClose(eventDetails);
				if (!nextOpen && eventDetails.trigger == null) eventDetails.trigger = activeTriggerElement ?? void 0;
				onOpenChange?.(nextOpen, eventDetails);
				if (eventDetails.isCanceled) return;
				store.state.floatingRootContext.dispatchOpenChange(nextOpen, eventDetails);
				const nativeEvent = eventDetails.event;
				if (nextOpen === false && reason !== "item-press" && nativeEvent?.type === "click" && nativeEvent.pointerType === "touch" && !allowTouchToCloseRef.current) return;
				if (nextOpen && reason === "trigger-focus") {
					allowTouchToCloseRef.current = false;
					allowTouchToCloseTimeout.start(300, () => {
						allowTouchToCloseRef.current = true;
					});
				} else {
					allowTouchToCloseRef.current = true;
					allowTouchToCloseTimeout.clear();
				}
				const isDismissClose = !nextOpen && (reason === "escape-key" || reason == null);
				openEventRef.current = eventDetails.event;
				const popupOpenState = createPopupOpenState(store.state, nextOpen, eventDetails.trigger, shouldPreventUnmountOnClose());
				popupOpenState.openChangeReason = reason;
				popupOpenState.keyboardOpen = nextOpen && isKeyboardOpen(reason, nativeEvent);
				if (parent.type === "menubar" && (reason === "trigger-focus" || reason === "focus-out" || reason === "trigger-hover" || reason === "list-navigation" || reason === "sibling-open")) popupOpenState.instantType = "group";
				else if (isKeyboardClick(reason, nativeEvent)) popupOpenState.instantType = "click";
				else if (isDismissClose) popupOpenState.instantType = "dismiss";
				else popupOpenState.instantType = void 0;
				store.update(popupOpenState);
			});
			const floatingRootContext = useSyncedFloatingRootContext({
				popupStore: store,
				floatingRootContext: store.state.floatingRootContext,
				floatingId,
				nested: floatingParentNodeIdFromContext != null,
				onOpenChange: setOpen
			});
			const floatingEvents = floatingRootContext.context.events;
			useIsoLayoutEffect(() => {
				const handleSetOpenEvent = ({ open: nextOpen, eventDetails }) => setOpen(nextOpen, eventDetails);
				floatingEvents.on("setOpen", handleSetOpenEvent);
				return () => {
					floatingEvents?.off("setOpen", handleSetOpenEvent);
				};
			}, [floatingEvents, setOpen]);
			useIsoLayoutEffect(() => store.subscribeToParentMenu(), [store]);
			const handleImperativeClose = react.useCallback(() => {
				store.setOpen(false, createChangeEventDetails(imperativeAction));
			}, [store]);
			react.useImperativeHandle(actionsRef, () => ({
				unmount: forceUnmount,
				close: handleImperativeClose
			}), [forceUnmount, handleImperativeClose]);
			let ctx;
			if (parent.type === "context-menu") ctx = parent.context;
			react.useImperativeHandle(ctx?.positionerRef, () => positionerElement, [positionerElement]);
			react.useImperativeHandle(ctx?.actionsRef, () => ({ setOpen }), [setOpen]);
			const dismiss = useDismiss(floatingRootContext, {
				enabled: !disabled,
				bubbles: { escapeKey: closeParentOnEsc && parent.type === "menu" },
				outsidePress() {
					if (parent.type !== "context-menu" || openEventRef.current?.type === "contextmenu") return true;
					return allowOutsidePressDismissalRef.current;
				},
				externalTree: nested ? floatingTreeRoot : void 0
			});
			const direction = useDirection();
			const listNavigation$1 = useListNavigation(floatingRootContext, {
				enabled: !disabled,
				listRef: store.context.itemDomElements,
				activeIndex,
				virtual: virtualFocus,
				nested: parent.type === "menubar" || !virtualFocus && parent.type !== void 0,
				parentOrientation: parent.type === "menubar" ? parent.context.orientation : void 0,
				loopFocus,
				focusItemOnOpen: virtualFocus ? keyboardOpen : void 0,
				allowEscape: virtualFocus && loopFocus && allowEscape,
				orientation,
				triggerOrientation: virtualFocus ? "vertical" : orientation,
				rtl: direction === "rtl",
				disabledIndices: EMPTY_ARRAY,
				onNavigate(nextActiveIndex, event) {
					store.setActiveIndex(nextActiveIndex, getHighlightReason(event), event?.nativeEvent);
				},
				openOnArrowKeyDown: parent.type !== "context-menu" && !(virtualFocus && isSubmenu),
				externalTree: !virtualFocus && nested ? floatingTreeRoot : void 0,
				nestedReturnFocusRef: parentMenuStore?.context.virtualFocusRef,
				focusItemOnHover: highlightItemOnHover,
				resetOnPointerLeave
			});
			const onTyping = react.useCallback((nextTyping) => {
				store.context.typingRef.current = nextTyping;
			}, [store]);
			const typeahead = useTypeahead(floatingRootContext, {
				enabled: !disabled && !virtualFocus,
				listRef: store.context.itemLabels,
				elementsRef: store.context.itemDomElements,
				activeIndex,
				resetMs: 500,
				onMatch: (index, event) => {
					if (open && index !== activeIndex) store.setActiveIndex(index, keyboard, event.nativeEvent);
				},
				onTyping
			});
			const onItemHighlighted = useStableCallback(onItemHighlightedProp);
			const lastHighlightIndexRef = react.useRef(-1);
			const syncHighlightedItem = useStableCallback(() => {
				const index = store.state.activeIndex;
				const item = index === null ? void 0 : store.context.itemDomElements.current[index] ?? void 0;
				if (item?.isConnected === false) return;
				const itemIndex = item === void 0 ? -1 : index;
				if (lastHighlightIndexRef.current === itemIndex && store.context.reportedItem === item) return;
				lastHighlightIndexRef.current = itemIndex;
				store.context.reportedItem = item;
				if (virtualFocus) store.set("highlightedItem", item);
				const { highlightReason, highlightEvent } = store.context;
				store.context.highlightReason = none;
				store.context.highlightEvent = void 0;
				if (!onItemHighlightedProp) return;
				onItemHighlighted(item, createGenericEventDetails(highlightReason, highlightEvent, { label: item === void 0 ? void 0 : store.context.itemLabels.current[itemIndex] ?? void 0 }));
			});
			useIsoLayoutEffect(() => {
				syncHighlightedItem();
			}, [activeIndex, syncHighlightedItem]);
			const openTriggerProps = react.useMemo(() => {
				if (!virtualFocus) return listNavigation$1.reference;
				if (!listNavigation$1.trigger) return EMPTY_OBJECT;
				const { onFocus, ...rest } = listNavigation$1.trigger;
				return rest;
			}, [
				virtualFocus,
				listNavigation$1.reference,
				listNavigation$1.trigger
			]);
			store.useSyncedValue("inputProps", virtualFocus ? listNavigation$1.reference ?? EMPTY_OBJECT : EMPTY_OBJECT);
			const activeTriggerProps = react.useMemo(() => {
				const mergedProps = mergeProps(typeahead.reference, openTriggerProps, dismiss.reference, { onMouseMove() {
					store.set("allowMouseEnter", true);
				} }, interactionTypeProps);
				mergedProps["aria-haspopup"] = "menu";
				mergedProps["aria-expanded"] = open;
				return mergedProps;
			}, [
				store,
				typeahead.reference,
				openTriggerProps,
				dismiss.reference,
				interactionTypeProps,
				open
			]);
			const inactiveTriggerProps = react.useMemo(() => {
				const mergedProps = mergeProps(listNavigation$1.trigger, dismiss.trigger, interactionTypeProps);
				mergedProps["aria-haspopup"] = "menu";
				mergedProps["aria-expanded"] = false;
				return mergedProps;
			}, [
				listNavigation$1.trigger,
				dismiss.trigger,
				interactionTypeProps
			]);
			useRefWithInit(() => {
				store.update({ inactiveTriggerProps });
				return null;
			});
			usePopupInteractionProps(store, {
				floatingRootContext,
				activeTriggerProps,
				inactiveTriggerProps,
				popupProps: react.useMemo(() => mergeProps(FOCUSABLE_POPUP_PROPS, {
					onMouseMove() {
						store.set("allowMouseEnter", true);
						if (parent.type === "menu") store.set("hoverEnabled", false);
					},
					onClick() {
						if (store.select("hoverEnabled")) store.set("hoverEnabled", false);
					},
					onKeyDown(event) {
						const relay = store.select("keyboardEventRelay");
						if (relay && !event.isPropagationStopped()) relay(event);
					}
				}, typeahead.floating, listNavigation$1.floating, dismiss.floating), [
					parent.type,
					store,
					typeahead.floating,
					listNavigation$1.floating,
					dismiss.floating
				]),
				itemProps: listNavigation$1.item ?? EMPTY_OBJECT
			});
			const context = react.useMemo(() => ({
				store,
				parent: parentFromContext,
				orientation,
				loopFocus,
				allowEscape,
				defaultFloatingId,
				setRenderedFloatingId,
				virtualFocus,
				parentVirtualFocus,
				syncHighlightedItem
			}), [
				store,
				parentFromContext,
				orientation,
				loopFocus,
				allowEscape,
				defaultFloatingId,
				virtualFocus,
				parentVirtualFocus,
				syncHighlightedItem
			]);
			const renderedChildren = typeof children === "function" ? children({ payload }) : children;
			let content = /*#__PURE__*/ (0, react_jsx_runtime.jsxs)(MenuRootContext.Provider, {
				value: context,
				children: [handle && /*#__PURE__*/ (0, react_jsx_runtime.jsx)(PopupHandleAttachment, {
					handle,
					store
				}), renderedChildren]
			});
			if (parent.type === void 0 || parent.type === "context-menu") content = /*#__PURE__*/ (0, react_jsx_runtime.jsx)(FloatingTree, {
				externalTree: floatingTreeRoot,
				children: content
			});
			return content;
		});
		function MenuRoot(props) {
			const filterProvider = react.useContext(MenuFilterProviderContext);
			if (filterProvider === null) return /*#__PURE__*/ (0, react_jsx_runtime.jsx)(MenuRootInternal, { ...props });
			const FilterRoot = filterProvider.Root;
			return /*#__PURE__*/ (0, react_jsx_runtime.jsx)(MenuFilterProviderContext.Provider, {
				value: null,
				children: /*#__PURE__*/ (0, react_jsx_runtime.jsx)(FilterRoot, {
					...filterProvider.options,
					...props
				})
			});
		}
		//#endregion
		//#region node_modules/.pnpm/@base-ui+react@1.9.0_@date-fns+tz@1.5.0_@types+react@18.3.31_date-fns@4.4.0_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/react/menu/submenu-root/MenuSubmenuRoot.mjs
		const EMPTY_SUBMENU_ROOT_CONTEXT = {};
		/**
		* Groups all parts of a submenu.
		* Doesn't render its own HTML element.
		*
		* Documentation: [Base UI Menu](https://base-ui.com/react/components/menu)
		*/
		function MenuSubmenuRoot(props) {
			useMenuRootContext();
			const filterProvider = react.useContext(MenuFilterProviderContext);
			if (filterProvider !== null) {
				const FilterSubmenuRoot = filterProvider.SubmenuRoot;
				return /*#__PURE__*/ (0, react_jsx_runtime.jsx)(MenuFilterProviderContext.Provider, {
					value: null,
					children: /*#__PURE__*/ (0, react_jsx_runtime.jsx)(FilterSubmenuRoot, {
						...filterProvider.options,
						...props
					})
				});
			}
			return /*#__PURE__*/ (0, react_jsx_runtime.jsx)(MenuSubmenuRootContext.Provider, {
				value: EMPTY_SUBMENU_ROOT_CONTEXT,
				children: /*#__PURE__*/ (0, react_jsx_runtime.jsx)(MenuRootInternal, {
					...props,
					isSubmenu: true
				})
			});
		}
		//#endregion
		//#region node_modules/.pnpm/@base-ui+react@1.9.0_@date-fns+tz@1.5.0_@types+react@18.3.31_date-fns@4.4.0_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@base-ui/react/menu/submenu-trigger/MenuSubmenuTrigger.mjs
		const VOICE_OVER_EXPANDED_PROPS = { "aria-expanded": void 0 };
		const MenuSubmenuTriggerPlain = /*#__PURE__*/ react.forwardRef(function MenuSubmenuTriggerPlain(componentProps, forwardedRef) {
			const { render, className, style, label, id: idProp, nativeButton = false, openOnHover = true, delay = 100, closeDelay = 0, disabled: disabledProp = false, ...elementProps } = componentProps;
			const context = useMenuRootContext(true);
			if (context?.parent.type !== "menu") throw new Error(formatErrorMessage(37));
			const menuPositionerContext = useMenuPositionerContext();
			const submenuRootContext = useMenuSubmenuRootContext();
			const { store, parentVirtualFocus } = context;
			const parentMenuStore = context.parent.store;
			const listItem = useCompositeListItem({
				guess: true,
				label
			});
			const thisTriggerId = useBaseUiId(idProp);
			const open = store.useState("open");
			const focusReturnedThroughGuardRef = react.useRef(false);
			const positionerElement = store.useState("positionerElement");
			const floatingRootContext = store.useState("floatingRootContext");
			const floatingTreeRoot = store.useState("floatingTreeRoot");
			const popupId = store.useState("triggerPopupId", thisTriggerId);
			const baseRegisterTrigger = useTriggerRegistration(thisTriggerId, store);
			const registerTrigger = useStableCallback((element) => {
				baseRegisterTrigger(element);
				const activeTriggerElement = store.select("activeTriggerElement");
				if (element !== null && store.select("open") && (activeTriggerElement === element || store.select("activeTriggerId") == null)) store.update({
					activeTriggerId: thisTriggerId ?? null,
					activeTriggerElement: element,
					closeDelay
				});
			});
			const triggerElementRef = react.useRef(null);
			const handleTriggerElementRef = react.useCallback((el) => {
				triggerElementRef.current = el;
				store.set("activeTriggerElement", el);
			}, [store]);
			useIsoLayoutEffect(() => {
				registerTrigger(triggerElementRef.current);
				return () => registerTrigger(null);
			}, [
				registerTrigger,
				thisTriggerId,
				store
			]);
			useIsoLayoutEffect(() => {
				if (!open || !positionerElement) return;
				function handleGuardFocusOut(event) {
					if (getTarget(event) === store.context.beforeContentFocusGuardRef.current) focusReturnedThroughGuardRef.current = event.relatedTarget === triggerElementRef.current;
				}
				positionerElement.addEventListener("focusout", handleGuardFocusOut, true);
				return () => {
					focusReturnedThroughGuardRef.current = false;
					positionerElement.removeEventListener("focusout", handleGuardFocusOut, true);
				};
			}, [
				open,
				positionerElement,
				store
			]);
			store.useSyncedValue("closeDelay", closeDelay);
			const rootDisabled = store.useState("disabled");
			const parentDisabled = parentMenuStore.useState("disabled");
			const disabled = disabledProp || rootDisabled || parentDisabled;
			const itemProps = parentMenuStore.useState("itemProps");
			const highlighted = parentMenuStore.useState("isActive", listItem.index);
			const itemMetadata = react.useMemo(() => ({
				type: "submenu-trigger",
				setActive(event) {
					if (parentMenuStore.select("highlightItemOnHover")) parentMenuStore.setActiveIndex(listItem.index, pointer, event);
				}
			}), [parentMenuStore, listItem.index]);
			const { getItemProps, itemRef } = useMenuItem({
				closeOnClick: false,
				disabled,
				highlighted,
				id: thisTriggerId,
				store,
				typingRef: parentMenuStore.context.typingRef,
				nativeButton,
				itemMetadata,
				nodeId: menuPositionerContext?.context.nodeId
			});
			const hoverProps = useHoverReferenceInteraction(floatingRootContext, {
				enabled: store.useState("hoverEnabled") && openOnHover && !disabled,
				handleClose: safePolygon({ blockPointerEvents: true }),
				mouseOnly: true,
				move: true,
				restMs: delay,
				delay: {
					open: delay,
					close: closeDelay
				},
				shouldOpen: delay > 0 ? () => parentMenuStore.select("allowMouseEnter") : void 0,
				triggerElementRef,
				externalTree: floatingTreeRoot,
				isClosing: () => store.select("transitionStatus") === "ending",
				guardStaleOpen: true
			});
			const localInteractionProps = useClick(floatingRootContext, {
				enabled: !disabled,
				event: "mousedown",
				toggle: true,
				ignoreMouse: openOnHover,
				stickIfOpen: openOnHover
			}).reference ?? EMPTY_OBJECT;
			const rootTriggerProps = store.useState("triggerProps", true);
			delete rootTriggerProps.id;
			const state = {
				disabled,
				highlighted,
				open
			};
			const openMethod = store.useState("openMethod");
			const openedByKeyboard = store.useState("lastOpenChangeReason") === "list-navigation" || openMethod === "keyboard";
			const shouldOmitExpanded = open && openedByKeyboard && voiceOver;
			const submenuKeyDownProps = submenuRootContext?.onTriggerKeyDown ? { onKeyDown: submenuRootContext.onTriggerKeyDown } : void 0;
			return useRenderElement("div", componentProps, {
				state,
				stateAttributesMapping: triggerOpenStateMapping,
				props: [
					localInteractionProps,
					hoverProps,
					rootTriggerProps,
					submenuKeyDownProps,
					itemProps,
					shouldOmitExpanded ? VOICE_OVER_EXPANDED_PROPS : void 0,
					{
						"aria-controls": popupId,
						tabIndex: parentVirtualFocus || !(open || highlighted) ? -1 : 0,
						onFocus(event) {
							if (store.select("open") && focusReturnedThroughGuardRef.current) {
								focusReturnedThroughGuardRef.current = false;
								store.setOpen(false, createChangeEventDetails(focusOut, event.nativeEvent));
							}
						},
						onBlur() {
							if (highlighted) parentMenuStore.setActiveIndex(null, none);
						}
					},
					elementProps,
					getItemProps
				],
				ref: [
					forwardedRef,
					listItem.ref,
					itemRef,
					registerTrigger,
					handleTriggerElementRef
				]
			});
		});
		const MenuSubmenuTrigger = /*#__PURE__*/ react.forwardRef(function MenuSubmenuTrigger(props, forwardedRef) {
			const filterItem = useMenuFilterItem(props, forwardedRef, "submenu-trigger");
			if (!filterItem.visible) return null;
			const mergedProps = filterItem.props ? mergeProps(filterItem.props, props) : props;
			return /*#__PURE__*/ (0, react_jsx_runtime.jsx)(MenuSubmenuTriggerPlain, {
				...mergedProps,
				ref: filterItem.ref
			});
		});
		//#endregion
		//#region packages/client/src/client/ds/shell-layer.ts
		function useShellLayer(element, open, onClose) {
			(0, _deepseek_ai_dsh_client_ui_primitives.useModalLayer)(element, open, onClose);
		}
		//#endregion
		//#region packages/client/src/client/ds/menu.tsx
		const MenuContext = (0, react.createContext)(false);
		const POINTER_GRACE_MS = 300;
		function rowStyles(look, selectedFill, danger) {
			return {
				0: { className: "bhx9f619 bhx78zum5 bhx6s0dn4 bhx1e5nl48 bhx1bev70i bhx1ty6q3q bhx14zrpzh bhx7em7do bhxc342km bhxvz6vxc bhxjbqb8w bhxacn7go bhx1heor9g bhxln7xf2 bhx1yc453h bhx1ypdohk bhx1m8qfh3 bhx1hc1fzr bhxxh3kiz bhx1a2a7pz bhx87ps6o" },
				8: { className: "bhx9f619 bhx78zum5 bhx6s0dn4 bhx1e5nl48 bhx1bev70i bhx14zrpzh bhx7em7do bhxc342km bhxvz6vxc bhxjbqb8w bhxacn7go bhx1heor9g bhxln7xf2 bhx1yc453h bhx1ypdohk bhx1m8qfh3 bhx1hc1fzr bhxxh3kiz bhx1a2a7pz bhx87ps6o bhxpjic2s" },
				4: { className: "bhx9f619 bhx78zum5 bhx6s0dn4 bhx1e5nl48 bhx1bev70i bhx14zrpzh bhx7em7do bhxc342km bhxvz6vxc bhxjbqb8w bhxacn7go bhx1heor9g bhxln7xf2 bhx1yc453h bhx1ypdohk bhx1m8qfh3 bhx1hc1fzr bhxxh3kiz bhx1a2a7pz bhx87ps6o bhxov48po" },
				12: { className: "bhx9f619 bhx78zum5 bhx6s0dn4 bhx1e5nl48 bhx1bev70i bhx14zrpzh bhx7em7do bhxc342km bhxvz6vxc bhxjbqb8w bhxacn7go bhx1heor9g bhxln7xf2 bhx1yc453h bhx1ypdohk bhx1m8qfh3 bhx1hc1fzr bhxxh3kiz bhx1a2a7pz bhx87ps6o bhxov48po" },
				2: { className: "bhx9f619 bhx78zum5 bhx6s0dn4 bhx1e5nl48 bhx1bev70i bhx1ty6q3q bhx14zrpzh bhx7em7do bhxc342km bhxvz6vxc bhxln7xf2 bhx1yc453h bhx1ypdohk bhx1m8qfh3 bhx1hc1fzr bhxxh3kiz bhx1a2a7pz bhx87ps6o bhxxt5fwl bhx1btfezm" },
				10: { className: "bhx9f619 bhx78zum5 bhx6s0dn4 bhx1e5nl48 bhx1bev70i bhx14zrpzh bhx7em7do bhxc342km bhxvz6vxc bhxln7xf2 bhx1yc453h bhx1ypdohk bhx1m8qfh3 bhx1hc1fzr bhxxh3kiz bhx1a2a7pz bhx87ps6o bhxpjic2s bhxxt5fwl bhx1btfezm" },
				6: { className: "bhx9f619 bhx78zum5 bhx6s0dn4 bhx1e5nl48 bhx1bev70i bhx14zrpzh bhx7em7do bhxc342km bhxvz6vxc bhxln7xf2 bhx1yc453h bhx1ypdohk bhx1m8qfh3 bhx1hc1fzr bhxxh3kiz bhx1a2a7pz bhx87ps6o bhxov48po bhxxt5fwl bhx1btfezm" },
				14: { className: "bhx9f619 bhx78zum5 bhx6s0dn4 bhx1e5nl48 bhx1bev70i bhx14zrpzh bhx7em7do bhxc342km bhxvz6vxc bhxln7xf2 bhx1yc453h bhx1ypdohk bhx1m8qfh3 bhx1hc1fzr bhxxh3kiz bhx1a2a7pz bhx87ps6o bhxov48po bhxxt5fwl bhx1btfezm" },
				1: { className: "bhx9f619 bhx78zum5 bhx6s0dn4 bhx1e5nl48 bhx1bev70i bhx1ty6q3q bhx14zrpzh bhx7em7do bhxc342km bhxvz6vxc bhxjbqb8w bhxacn7go bhxln7xf2 bhx1yc453h bhx1ypdohk bhx1m8qfh3 bhx1hc1fzr bhxxh3kiz bhx1a2a7pz bhx87ps6o bhx1cq2c6i" },
				9: { className: "bhx9f619 bhx78zum5 bhx6s0dn4 bhx1e5nl48 bhx1bev70i bhx14zrpzh bhx7em7do bhxc342km bhxvz6vxc bhxjbqb8w bhxacn7go bhxln7xf2 bhx1yc453h bhx1ypdohk bhx1m8qfh3 bhx1hc1fzr bhxxh3kiz bhx1a2a7pz bhx87ps6o bhxpjic2s bhx1cq2c6i" },
				5: { className: "bhx9f619 bhx78zum5 bhx6s0dn4 bhx1e5nl48 bhx1bev70i bhx14zrpzh bhx7em7do bhxc342km bhxvz6vxc bhxjbqb8w bhxacn7go bhxln7xf2 bhx1yc453h bhx1ypdohk bhx1m8qfh3 bhx1hc1fzr bhxxh3kiz bhx1a2a7pz bhx87ps6o bhxov48po bhx1cq2c6i" },
				13: { className: "bhx9f619 bhx78zum5 bhx6s0dn4 bhx1e5nl48 bhx1bev70i bhx14zrpzh bhx7em7do bhxc342km bhxvz6vxc bhxjbqb8w bhxacn7go bhxln7xf2 bhx1yc453h bhx1ypdohk bhx1m8qfh3 bhx1hc1fzr bhxxh3kiz bhx1a2a7pz bhx87ps6o bhxov48po bhx1cq2c6i" },
				3: { className: "bhx9f619 bhx78zum5 bhx6s0dn4 bhx1e5nl48 bhx1bev70i bhx1ty6q3q bhx14zrpzh bhx7em7do bhxc342km bhxvz6vxc bhxln7xf2 bhx1yc453h bhx1ypdohk bhx1m8qfh3 bhx1hc1fzr bhxxh3kiz bhx1a2a7pz bhx87ps6o bhxxt5fwl bhx1cq2c6i" },
				11: { className: "bhx9f619 bhx78zum5 bhx6s0dn4 bhx1e5nl48 bhx1bev70i bhx14zrpzh bhx7em7do bhxc342km bhxvz6vxc bhxln7xf2 bhx1yc453h bhx1ypdohk bhx1m8qfh3 bhx1hc1fzr bhxxh3kiz bhx1a2a7pz bhx87ps6o bhxpjic2s bhxxt5fwl bhx1cq2c6i" },
				7: { className: "bhx9f619 bhx78zum5 bhx6s0dn4 bhx1e5nl48 bhx1bev70i bhx14zrpzh bhx7em7do bhxc342km bhxvz6vxc bhxln7xf2 bhx1yc453h bhx1ypdohk bhx1m8qfh3 bhx1hc1fzr bhxxh3kiz bhx1a2a7pz bhx87ps6o bhxov48po bhxxt5fwl bhx1cq2c6i" },
				15: { className: "bhx9f619 bhx78zum5 bhx6s0dn4 bhx1e5nl48 bhx1bev70i bhx14zrpzh bhx7em7do bhxc342km bhxvz6vxc bhxln7xf2 bhx1yc453h bhx1ypdohk bhx1m8qfh3 bhx1hc1fzr bhxxh3kiz bhx1a2a7pz bhx87ps6o bhxov48po bhxxt5fwl bhx1cq2c6i" }
			}[!!look.dense << 3 | !!look.compact << 2 | !!selectedFill << 1 | !!danger << 0];
		}
		function RowContent({ icon, label, shortcut, trailing }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
				icon === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: "bhx3nfvp2 bhx6s0dn4 bhxl56j7k bhx2lah0s bhx13k4gh1 bhx14lg19 bhxd7xfip",
					children: icon
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: "bhx12lumcd bhxeuugli bhxb3r6kr bhxlyipyv bhxuxw1ft",
					children: label
				}),
				shortcut === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: "bhx3nfvp2 bhx6s0dn4 bhx2lah0s bhx1axu3v7",
					"aria-hidden": "true",
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(KeyCombo, { keys: shortcut.keys })
				}),
				trailing === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: "bhx3nfvp2 bhx6s0dn4 bhx2lah0s bhx1axu3v7",
					children: trailing
				})
			] });
		}
		function Entries({ entries, context }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(react_jsx_runtime.Fragment, { children: entries.map((entry, index) => {
				if ("type" in entry && entry.type === "separator") return index === 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					role: "separator",
					className: "bhx121clqe bhx14t6loe bhxw7g2o2 bhx1tfgve3"
				}, entry.id);
				if ("type" in entry && entry.type === "label") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					role: "presentation",
					className: "bhx1bcthrq bhx1j7gxbw bhx1axu3v7 bhxh82noc bhx1g71p44",
					children: entry.text
				}, entry.id);
				const item = entry;
				const selected = context.selected.has(item.id);
				if (item.submenu !== void 0 && item.submenu.length > 0) return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(MenuSubmenuRoot, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(MenuSubmenuTrigger, {
					disabled: item.disabled,
					"data-danger": item.danger ? "" : void 0,
					...rowStyles(context.look, false, item.danger === true),
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(RowContent, {
						icon: item.icon,
						label: item.label,
						trailing: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, { name: "chevron-right" })
					})
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(MenuPortal, { children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(MenuPositioner, {
					side: "inline-end",
					align: "start",
					sideOffset: 4,
					className: "bhxp6lfbs bhx1a2a7pz",
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(MenuPopup, {
						className: context.listClass,
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "bhx1odjw0f bhx2lwn1j bhx12lumcd",
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Entries, {
								entries: item.submenu,
								context
							})
						})
					})
				}) })] }, item.id);
				return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(MenuItem, {
					disabled: item.disabled,
					closeOnClick: false,
					"aria-checked": selected && context.selection === "check" ? true : void 0,
					"data-selected": selected ? "" : void 0,
					"data-danger": item.danger ? "" : void 0,
					"aria-keyshortcuts": item.shortcut?.aria,
					onClick: (event) => {
						event.preventBaseUIHandler();
						context.onSelect?.(item.id);
					},
					...rowStyles(context.look, selected && context.selection === "fill", item.danger === true),
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(RowContent, {
						icon: item.icon,
						label: item.label,
						shortcut: item.shortcut,
						trailing: selected && context.selection === "check" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, { name: "check" }) : void 0
					})
				}, item.id);
			}) });
		}
		function firstButton(node) {
			return node?.querySelector("button, [tabindex]:not([tabindex=\"-1\"])") ?? node;
		}
		function Menu({ open, anchor, items = [], children, footer, selectedId, selectedIds, onSelect, onClose, align = "start", side = "bottom", portal = false, closeOnPointerLeave = false, dense = false, compact = false, selection = "check", autoFocus = false, returnFocus, anchorRef, point, container, className, listClassName }) {
			const wrapper = (0, react.useRef)(null);
			const popup = (0, react.useRef)(null);
			const previousFocus = (0, react.useRef)(null);
			const leave = (0, react.useRef)(void 0);
			const focusFrame = (0, react.useRef)(void 0);
			const [mounted, setMounted] = (0, react.useState)(false);
			const attach = (0, react.useCallback)((node) => {
				if (node !== null && popup.current === null) {
					const active = node.ownerDocument.activeElement;
					previousFocus.current = active instanceof HTMLElement && active !== node.ownerDocument.body ? active : null;
				}
				if (node === null) {
					if (focusFrame.current !== void 0) window.cancelAnimationFrame(focusFrame.current);
					focusFrame.current = void 0;
					if (leave.current !== void 0) window.clearTimeout(leave.current);
					leave.current = void 0;
				}
				popup.current = node;
				setMounted(node !== null);
				if (node !== null && autoFocus) focusFrame.current = window.requestAnimationFrame(() => {
					focusFrame.current = void 0;
					node.querySelector("[role=\"menuitem\"]:not([data-disabled])")?.focus();
				});
			}, [autoFocus]);
			useShellLayer(popup, open && mounted, onClose);
			const stay = () => {
				if (leave.current !== void 0) window.clearTimeout(leave.current);
				leave.current = void 0;
			};
			const away = () => {
				if (!closeOnPointerLeave || !open) return;
				stay();
				leave.current = window.setTimeout(onClose, POINTER_GRACE_MS);
			};
			const selected = /* @__PURE__ */ new Set([...selectedId === void 0 ? [] : [selectedId], ...selectedIds ?? []]);
			const listClass = [
				APPEARANCE_CLASS,
				{
					0: { className: "bhx9f619 bhx78zum5 bhxdt5ytf bhx1d77m7x bhx74h4c1 bhx8l92br bhx1bcthrq bhx1i9s7pd bhx1k5awnc bhxb3z3mx bhx103lb5k bhxjb2p0i bhx1779mkw bhxe5wb2f bhx1a2a7pz bhxpv5g7k bhx1cbrp87 bhx1u6grsq" },
					1: { className: "bhx9f619 bhx78zum5 bhxdt5ytf bhx74h4c1 bhx8l92br bhx1bcthrq bhx1i9s7pd bhx1k5awnc bhxb3z3mx bhx103lb5k bhxjb2p0i bhx1a2a7pz bhxpv5g7k bhx1cbrp87 bhx1u6grsq bhxh82noc bhx1g71p44 bhx1i9suas" }
				}[!!compact << 0].className,
				listClassName
			].filter(Boolean).join(" ");
			const context = {
				look: {
					dense,
					compact
				},
				selected,
				selection,
				onSelect,
				listClass
			};
			const anchorTarget = point !== void 0 ? { getBoundingClientRect: () => new DOMRect(point.x, point.y, 0, 0) } : anchorRef !== void 0 ? anchorRef : wrapper;
			const baseSide = side === "right" ? "inline-end" : side;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
				ref: wrapper,
				className: [{ className: "bhx3nfvp2 bhxeuugli" }.className, className].filter(Boolean).join(" "),
				"data-tobs-menu-anchor": "",
				onPointerEnter: stay,
				onPointerLeave: away,
				children: [anchor, /* @__PURE__ */ (0, react_jsx_runtime.jsx)(MenuRoot, {
					open,
					modal: false,
					onOpenChange: (next) => {
						if (!next) onClose();
					},
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(MenuPortal, {
						container: typeof HTMLElement !== "undefined" && container instanceof HTMLElement ? container : portal || point !== void 0 ? void 0 : wrapper,
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(MenuPositioner, {
							anchor: anchorTarget,
							side: baseSide,
							align,
							sideOffset: point === void 0 ? 4 : 0,
							collisionPadding: 16,
							positionMethod: "fixed",
							className: "bhxp6lfbs bhx1a2a7pz",
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(MenuPopup, {
								ref: attach,
								"data-pointer-menu": point === void 0 ? void 0 : "",
								className: listClass,
								finalFocus: () => {
									if (returnFocus !== void 0) return returnFocus() ?? false;
									const active = document.activeElement;
									if (active !== document.body && active instanceof HTMLElement && !popup.current?.contains(active)) return active;
									return previousFocus.current?.isConnected ? previousFocus.current : firstButton(wrapper.current);
								},
								onPointerEnter: stay,
								onPointerLeave: away,
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(MenuContext.Provider, {
									value: true,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: "bhx1odjw0f bhx2lwn1j bhx12lumcd",
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Entries, {
											entries: items,
											context
										}), children]
									}), footer === void 0 || footer.length === 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										className: "bhx3psx0u bhxes3if4 bhx1f2dah2 bhxgm6bnx bhx13fuv20 bhx1odvp7i",
										children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Entries, {
											entries: footer,
											context
										})
									})]
								})
							})
						})
					})
				})]
			});
		}
		const MenuSurface = (0, react.forwardRef)(function MenuSurface({ compact = false, className, ...props }, ref) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				ref,
				...props,
				className: [
					APPEARANCE_CLASS,
					{
						0: { className: "bhx9f619 bhx1bcthrq bhx1i9s7pd bhx1k5awnc bhxb3z3mx bhx103lb5k bhx1779mkw bhxe5wb2f" },
						1: { className: "bhx9f619 bhx1bcthrq bhx1i9s7pd bhx1k5awnc bhxb3z3mx bhx103lb5k bhxh82noc bhx1g71p44 bhx1i9suas" }
					}[!!compact << 0].className,
					className
				].filter(Boolean).join(" ")
			});
		});
		//#endregion
		//#region packages/client/src/client/combobox.tsx
		const COMBOBOX_CSS = `
.bh-combobox { position: relative; flex: 1; min-width: 0; }
.bh-combobox-input { display: flex; padding-right: ${space.x6}; }
.bh-combobox input { width: 100%; text-overflow: ellipsis; }
.bh-combobox input[readonly] { cursor: pointer; }
.bh-combobox-toggle {
  position: absolute; right: 4px; top: 50%; transform: translateY(-50%); width: 24px; height: 24px;
  display: flex; align-items: center; justify-content: center;
  border: 0; border-radius: ${radius.sm}; padding: 0;
  color: var(--tobs-ink-secondary); background: transparent; cursor: pointer;
}
.bh-combobox-toggle:hover { background: var(--tobs-state-hover); }
.bh-combobox-toggle:disabled { opacity: 0.5; cursor: default; }
.bh-combobox-list {
  position: fixed; z-index: 1100; box-sizing: border-box;
  background: var(--tobs-layer-canvas);
  box-shadow: var(--tobs-elevation-2);
}
.bh-combobox-scroll > button {
  display: flex; align-items: baseline; justify-content: space-between; gap: ${space.x4};
  width: 100%; min-height: 34px; padding: ${space.x2} ${space.x3};
  border: 0; border-radius: ${radius.sm}; background: transparent;
  color: var(--tobs-ink-primary); text-align: left; font: inherit; font-size: ${text.bodySize}; line-height: ${text.bodyLine}; cursor: pointer;
  overflow-wrap: anywhere;
}
.bh-combobox-scroll > button[aria-selected="true"] { font-weight: ${text.strong}; }
.bh-combobox-scroll > button:disabled { color: var(--tobs-ink-tertiary); cursor: default; }
.bh-combobox-scroll > button:not(:disabled):hover, .bh-combobox-scroll > button[data-active] {
  background: var(--tobs-state-hover);
}
.bh-combobox-scroll { max-height: 260px; overflow-y: auto; padding: ${space.x2}; box-sizing: border-box; }
.bh-combobox-hint { flex: none; color: var(--tobs-ink-secondary); font-size: ${text.metaSize}; font-weight: ${text.regular}; }
.bh-combobox-empty { padding: ${space.x2} ${space.x3}; color: var(--tobs-ink-secondary); font-size: ${text.bodySize}; }
.bh-combobox-scroll > .bh-combobox-action { justify-content: flex-start; align-items: center; gap: ${space.x2}; border-top: ${border.hairline} solid ${color.divider}; border-radius: 0; margin-top: ${space.x2}; }
`;
		function Combobox({ value, options, onSelect, label, toggleLabel, disabled = false, invalid = false, errorId, placeholder, emptyLabel, fallbackValue, createLabel, searchable = true, className, action }) {
			const root = (0, react.useRef)(null);
			const panel = (0, react.useRef)(null);
			const listId = (0, react.useId)();
			const actionValue = `${listId}-action`;
			const [open, setOpen] = (0, react.useState)(false);
			const [query, setQuery] = (0, react.useState)(void 0);
			const [active, setActive] = (0, react.useState)(void 0);
			const current = value === "" && fallbackValue !== void 0 ? fallbackValue : value;
			const display = options.find((option) => option.value === current)?.label ?? current;
			const trimmed = query?.trim() ?? "";
			const needle = trimmed.toLowerCase();
			const matches = options.filter((option) => [
				option.label,
				option.value,
				option.hint ?? ""
			].some((text) => text.toLowerCase().includes(needle)));
			const choices = createLabel !== void 0 && trimmed !== "" && !options.some((option) => option.value === trimmed) ? [...matches, {
				value: trimmed,
				label: createLabel(trimmed)
			}] : matches;
			const shown = action === void 0 ? choices : [...choices, {
				value: actionValue,
				label: action.label,
				disabled: action.disabled
			}];
			const enabled = shown.filter((option) => option.disabled !== true);
			const hasPopup = shown.length > 0 || choices.length === 0 && emptyLabel !== void 0;
			const highlighted = shown.findIndex((option) => option.value === active && option.disabled !== true);
			const position = useAnchoredPanel({
				open,
				anchorRef: root,
				panelRef: panel,
				matchWidth: true,
				gap: 4,
				margin: 12
			});
			(0, _deepseek_ai_dsh_client_ui_primitives.useDismissOnOutsidePointer)(root, open, setOpen, panel);
			const dismiss = () => {
				setOpen(false);
				setQuery(void 0);
				setActive(void 0);
			};
			const select = (next) => {
				dismiss();
				if (action !== void 0 && next === actionValue) action.onSelect();
				else onSelect(next);
			};
			const typedChoice = () => {
				if (query === void 0) return current === "" ? void 0 : current;
				if (trimmed === "") return fallbackValue;
				if (createLabel !== void 0) return trimmed;
				const available = matches.filter((option) => option.disabled !== true);
				return (available.find((option) => option.value.toLowerCase() === needle || option.label.toLowerCase() === needle) ?? available[0])?.value;
			};
			const onKeyDown = (event) => {
				if (event.nativeEvent.isComposing) return;
				if (event.key === "Escape") {
					if (!open) return;
					event.preventDefault();
					event.stopPropagation();
					dismiss();
				} else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
					event.preventDefault();
					setOpen(true);
					if (enabled.length === 0) return;
					const offset = event.key === "ArrowDown" ? 1 : -1;
					const at = enabled.findIndex((option) => option.value === active);
					const next = enabled[at < 0 ? offset === 1 ? 0 : enabled.length - 1 : (at + offset + enabled.length) % enabled.length];
					setActive(next?.value);
					const index = shown.findIndex((option) => option.value === next?.value);
					document.getElementById(`${listId}-${index}`)?.scrollIntoView?.({ block: "nearest" });
				} else if (event.key === "Enter" && open) {
					event.preventDefault();
					const choice = shown[highlighted]?.value ?? typedChoice();
					if (choice === void 0) dismiss();
					else select(choice);
				}
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: className === void 0 ? "bh-combobox" : `bh-combobox ${className}`,
				ref: root,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Input, {
						className: "bh-combobox-input",
						role: "combobox",
						"aria-label": label,
						"aria-expanded": open && hasPopup,
						"aria-autocomplete": "list",
						"aria-controls": open && hasPopup ? listId : void 0,
						"aria-activedescendant": open && hasPopup && highlighted >= 0 ? `${listId}-${highlighted}` : void 0,
						"aria-invalid": invalid,
						"aria-describedby": invalid ? errorId : void 0,
						value: query ?? display,
						placeholder,
						disabled,
						autoComplete: "off",
						readOnly: !searchable,
						"data-searchable": searchable || void 0,
						onFocus: (event) => {
							if (searchable) event.currentTarget.select();
							setOpen(true);
						},
						onClick: () => setOpen(true),
						onChange: (event) => {
							setQuery(event.target.value);
							setActive(void 0);
							setOpen(true);
						},
						onBlur: dismiss,
						onKeyDown
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						className: "bh-combobox-toggle",
						type: "button",
						"aria-label": toggleLabel,
						disabled,
						tabIndex: -1,
						onPointerDown: (event) => event.preventDefault(),
						onClick: () => {
							if (open) dismiss();
							else {
								root.current?.querySelector("input")?.focus();
								setOpen(true);
							}
						},
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {
							name: "chevron-down",
							size: 16
						})
					}),
					open && !disabled && hasPopup ? (0, react_dom.createPortal)(/* @__PURE__ */ (0, react_jsx_runtime.jsx)(MenuSurface, {
						compact: true,
						ref: panel,
						id: listId,
						role: "listbox",
						"aria-label": label,
						className: "bh-combobox-list",
						"data-bh-appearance-owned": "",
						style: { ...position },
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "bh-combobox-scroll",
							children: [choices.length === 0 && emptyLabel !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "bh-combobox-empty",
								children: emptyLabel
							}) : null, shown.map((option, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
								id: `${listId}-${index}`,
								type: "button",
								role: "option",
								"aria-selected": option.value !== actionValue && option.value === current,
								className: option.value === actionValue ? "bh-combobox-action" : void 0,
								"data-action": option.value === actionValue || void 0,
								"data-value": option.value,
								"data-active": index === highlighted || void 0,
								disabled: option.disabled,
								tabIndex: -1,
								onPointerDown: (event) => event.preventDefault(),
								onMouseEnter: () => {
									if (option.disabled !== true) setActive(option.value);
								},
								onClick: () => select(option.value),
								children: [
									option.value === actionValue ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {
										name: "plus",
										size: 16
									}) : null,
									option.label,
									option.hint === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "bh-combobox-hint",
										children: option.hint
									})
								]
							}, option.value))]
						})
					}), document.body) : null
				]
			});
		}
		//#endregion
		//#region packages/browser/src/client/profile-combobox.tsx
		function ProfileCombobox({ value, profiles, disabled, invalid, errorId, onSelect, t }) {
			const names = [.../* @__PURE__ */ new Set([
				"default",
				...profiles,
				value === "" ? "default" : value
			])];
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Combobox, {
				className: "bh-browser-profile-combobox",
				value,
				options: names.map((name) => ({
					value: name,
					label: name
				})),
				onSelect,
				label: t("entry.profile.label"),
				toggleLabel: t("entry.profile.choose"),
				disabled,
				invalid,
				errorId,
				fallbackValue: "default",
				createLabel: (name) => t("entry.profile.create", { name })
			});
		}
		//#endregion
		//#region packages/client/src/client/ds/pointer-menu.tsx
		function PointerMenu({ point, container, align = "start", ...props }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Menu, {
				...props,
				open: true,
				point,
				align,
				portal: true,
				container
			});
		}
		//#endregion
		//#region packages/client/src/client/ds/select.tsx
		function Select({ label, value, options, onChange, disabled = false, align = "end", autoFocus = false, reselect = false }) {
			const [open, setOpen] = (0, react.useState)(false);
			const [point, setPoint] = (0, react.useState)();
			const trigger = (0, react.useRef)(null);
			const active = open && !disabled;
			const mount = useMountedResource((node) => {
				trigger.current = node;
				if (!active) return () => {
					trigger.current = null;
				};
				const place = () => {
					const rect = node.getBoundingClientRect();
					const scale = node.offsetHeight > 0 ? rect.height / node.offsetHeight : 1;
					const next = {
						x: align === "end" ? rect.right : rect.left,
						y: rect.bottom + Number.parseFloat(space.x2) * scale
					};
					setPoint((previous) => previous?.x === next.x && previous.y === next.y ? previous : next);
				};
				place();
				const resize = typeof ResizeObserver === "undefined" ? void 0 : new ResizeObserver(place);
				resize?.observe(node);
				resize?.observe(document.documentElement);
				const observer = new MutationObserver(place);
				observer.observe(document.documentElement, {
					attributes: true,
					attributeFilter: ["style", "data-fullscreen"]
				});
				window.addEventListener("resize", place);
				window.addEventListener("scroll", place, true);
				return () => {
					trigger.current = null;
					resize?.disconnect();
					observer.disconnect();
					window.removeEventListener("resize", place);
					window.removeEventListener("scroll", place, true);
				};
			}, [active, align]);
			const close = () => {
				const button = trigger.current;
				const menu = document.activeElement?.closest("[data-pointer-menu]");
				setOpen(false);
				setPoint(void 0);
				queueMicrotask(() => {
					const focused = document.activeElement;
					if (button?.isConnected && !button.disabled && (focused === document.body || focused !== null && menu?.contains(focused))) button.focus({ preventScroll: true });
				});
			};
			const current = options.find((option) => option.value === value);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
				ref: mount,
				type: "button",
				"aria-label": label,
				"aria-haspopup": "menu",
				"aria-expanded": active,
				disabled,
				"data-modal-autofocus": autoFocus ? "" : void 0,
				onPointerDown: (event) => {
					if (active) event.stopPropagation();
				},
				onClick: () => {
					if (active) close();
					else setOpen(true);
				},
				className: "bhx9f619 bhx3nfvp2 bhx6s0dn4 bhx12e6dxb bhxeuugli bhx193iq5w bhxisypcw bhxocwxb3 bhx1lo940d bhxc342km bhxvz6vxc bhxym0p2z bhx1ikcoup bhx103lb5k bhxjb2p0i bhx1779mkw bhxe5wb2f bhx1ypdohk bhxtgyt42 bhx1hc1fzr bhxijokvz bhx1a2a7pz bhx1i94p6w bhx1g40iwv",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: "bhxeuugli bhxb3r6kr bhxlyipyv bhxuxw1ft",
					children: current?.label
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: "bhx3nfvp2 bhx2lah0s bhx1axu3v7",
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {
						name: "chevron-down",
						size: 12
					})
				})]
			}), active && point ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(PointerMenu, {
				point,
				align,
				container: trigger.current?.closest("[role=\"dialog\"]") ?? document.body,
				autoFocus: true,
				anchor: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { "aria-hidden": "true" }),
				items: options.map((option) => ({
					id: option.value,
					label: option.label
				})),
				selectedId: value,
				onSelect: (id) => {
					close();
					const next = options.find((option) => option.value === id);
					if (next !== void 0 && (reselect || next.value !== value)) onChange(next.value);
				},
				onClose: close
			}) : null] });
		}
		//#endregion
		//#region packages/browser/src/client/settings.tsx
		function ConfigChoice({ scope, field, value, writable, title, items }) {
			const [saving, setSaving] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)();
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SettingsRow, {
				title,
				control: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Select, {
					label: title,
					value,
					options: items.map((item) => ({
						value: item.id,
						label: item.label
					})),
					disabled: !writable || saving,
					onChange: (id) => {
						setSaving(true);
						setError(void 0);
						scope.set(field, id).then(() => {
							if (scope.getSnapshot().value?.[field] !== id) throw new Error("Browser setting was not saved");
						}).catch((cause) => setError(String(cause))).finally(() => setSaving(false));
					}
				})
			}), error === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Note, {
				tone: "danger",
				children: error
			})] });
		}
		function BrowserTargetSettings({ scope, t }) {
			const store = (0, react.useMemo)(() => ({
				subscribe: (listener) => scope.subscribe(listener),
				getSnapshot: () => scope.getSnapshot()
			}), [scope]);
			const snapshot = (0, react.useSyncExternalStore)(store.subscribe, store.getSnapshot);
			const target = snapshot.value?.target ?? "local";
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(SettingsGroupPart, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ConfigChoice, {
				scope,
				field: "target",
				value: target,
				writable: snapshot.writable,
				title: t("settings.target"),
				items: [
					"local",
					"container",
					"extension",
					"daily-control",
					"profile-control"
				].map((id) => ({
					id,
					label: t(`settings.${id}`)
				}))
			}), target !== "local" && target !== "container" ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ConfigChoice, {
				scope,
				field: target === "container" ? "containerDriver" : "localDriver",
				value: (target === "container" ? snapshot.value?.containerDriver : snapshot.value?.localDriver) ?? "current",
				writable: snapshot.writable,
				title: t(target === "container" ? "settings.containerDriver" : "settings.localDriver"),
				items: ["current", "agent-browser"].map((id) => ({
					id,
					label: t(`settings.driver.${id}`)
				}))
			})] });
		}
		function registerBrowserSettings(ctx, t) {
			ctx.inject(["configForms", "slots"], (settingsCtx) => {
				const native = settingsCtx;
				const scope = native.configForms.get("botharness-browser");
				return native.slots.inject("botharness.settings.section", () => native.slots.register({
					name: "botharness.settings.section",
					id: "browser",
					order: 32,
					label: () => t("settings.section"),
					locale: LOCALE_NS,
					inject: () => ({
						scope,
						t
					})
				}, BrowserTargetSettings));
			});
		}
		//#endregion
		//#region packages/browser/src/client/profile-browser.tsx
		function ProfileBrowserControl({ slug, view, paused, enabled, t, refresh }) {
			const [pair, setPair] = (0, react.useState)();
			const [busy, setBusy] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)();
			const active = (0, react.useRef)(false);
			const sequence = (0, react.useRef)(0);
			const resource = (0, react.useCallback)((node) => {
				active.current = node !== null;
				if (node === null) sequence.current += 1;
			}, []);
			const invoke = (action) => {
				if (slug === void 0 || busy) return;
				const request = ++sequence.current;
				setBusy(true);
				setError(void 0);
				setPair(void 0);
				fetch(action === "pause" ? "./api/browser/takeover" : `./api/browser/profile/${action}`, {
					method: "POST",
					cache: "no-store",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						slug,
						...action === "pause" ? { active: !paused } : {}
					})
				}).then(async (response) => {
					const body = await response.json();
					if (!response.ok || !body.ok) throw new Error(body.error ?? t("entry.error"));
					if (!active.current || sequence.current !== request) return;
					if (action === "pair" && body.code !== void 0 && body.expiresAt !== void 0) setPair({
						code: body.code,
						expiresAt: body.expiresAt
					});
				}).catch((cause) => {
					if (active.current && sequence.current === request) setError(cause instanceof Error ? cause.message : t("entry.error"));
				}).finally(() => {
					if (active.current && sequence.current === request) {
						setBusy(false);
						refresh();
					}
				});
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				ref: resource,
				className: "bh-browser-body bh-browser-borrow",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SidebarCardList, {
					className: "bh-browser-cards",
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SidebarCardRow, {
						icon: "globe",
						title: t("settings.profile-control"),
						chips: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [view?.paired !== true ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Tag, {
							tone: "neutral",
							children: t("entry.chip.unpaired")
						}) : view.connected ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Tag, {
							tone: "success",
							children: t("entry.chip.connected")
						}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Tag, {
							tone: "warning",
							children: t("entry.chip.offline")
						}), paused ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Tag, {
							tone: "warning",
							children: t("entry.chip.paused")
						}) : null] }),
						meta: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("entry.profile.scope") }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							role: "status",
							children: [view?.paired ? t(view.connected ? "entry.profile.connected" : "entry.profile.disconnected") : t("entry.view.noTabs"), view?.connected ? ` · ${view.tabs}` : ""]
						})] }),
						detail: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "bh-browser-card-detail",
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("a", {
									className: "bh-browser-daily-install",
									href: "https://github.com/BotHarness/BotHarness/blob/main/docs/daily-browser.md#chrome-profile-control",
									target: "_blank",
									rel: "noreferrer",
									children: t("entry.profile.install")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "bh-browser-actions",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Button, {
										size: "sm",
										variant: "outline",
										disabled: busy,
										onClick: () => invoke(view?.paired ? "forget" : "pair"),
										children: t(view?.paired ? "entry.profile.forget" : "entry.profile.pair")
									}), view?.connected ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Button, {
										size: "sm",
										variant: "outline",
										disabled: !enabled || busy,
										onClick: () => invoke("pause"),
										children: t(paused ? "entry.view.resume" : "entry.view.pause")
									}) : null]
								}),
								view?.paired || pair === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("entry.profile.instructions") }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Input, {
										"aria-label": t("entry.borrow.code"),
										value: pair.code,
										readOnly: true
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: location.origin })
								] })
							]
						})
					})
				}), error === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					role: "alert",
					className: "bh-browser-error",
					children: error
				})]
			});
		}
		//#endregion
		//#region packages/browser/src/client/daily-browser.tsx
		function DailyBrowserControl({ slug, view, enabled, paused, t, refresh }) {
			const [busy, setBusy] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)();
			const mounted = (0, react.useRef)(false);
			const resource = (0, react.useCallback)((node) => {
				mounted.current = node !== null;
			}, []);
			const invoke = (action) => {
				if (busy || slug === void 0) return;
				setBusy(true);
				setError(void 0);
				fetch(action === "pause" ? "./api/browser/takeover" : `./api/browser/daily/${action}`, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						slug,
						...action === "pause" ? { active: !paused } : {}
					})
				}).then(async (response) => {
					const body = await response.json();
					if (!response.ok || !body.ok) throw new Error(body.error ?? t("entry.error"));
				}).catch((cause) => {
					if (mounted.current) setError(cause instanceof Error ? cause.message : t("entry.error"));
				}).finally(() => {
					if (mounted.current) {
						setBusy(false);
						refresh();
					}
				});
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				ref: resource,
				className: "bh-browser-body bh-browser-borrow",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SidebarCardList, {
						className: "bh-browser-cards",
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SidebarCardRow, {
							icon: "globe",
							title: t("settings.daily-control"),
							chips: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [view === null || view.state === "error" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Tag, {
								tone: "neutral",
								children: t("entry.chip.disconnected")
							}) : view.state === "connecting" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Tag, {
								tone: "info",
								children: t("entry.chip.connecting")
							}) : view.state === "confirm" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Tag, {
								tone: "warning",
								children: t("entry.chip.confirm")
							}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Tag, {
								tone: "success",
								children: t("entry.chip.controlled")
							}), paused && view?.state === "controlled" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Tag, {
								tone: "warning",
								children: t("entry.chip.paused")
							}) : null] }),
							meta: view === null || view.state === "error" ? void 0 : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								role: "status",
								children: t(view.state === "connecting" ? "entry.daily.select" : view.state === "confirm" ? "entry.daily.confirm" : "entry.daily.controlled")
							}),
							detail: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "bh-browser-card-detail",
								children: [
									view === null || view.state === "error" || view.url === "" ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", {
										className: "bh-browser-borrow-title",
										children: view.title || view.url
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "bh-browser-borrow-url",
										children: view.url
									})] }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("a", {
										className: "bh-browser-daily-install",
										href: "https://chromewebstore.google.com/detail/playwright-extension/mmlmfjhmonkocbjadbfplnigmagldckm",
										target: "_blank",
										rel: "noreferrer",
										children: t("entry.daily.install")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										className: "bh-browser-actions",
										children: view === null || view.state === "error" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Button, {
											size: "sm",
											variant: "outline",
											disabled: !enabled || busy,
											onClick: () => invoke("connect"),
											children: t("entry.daily.connect")
										}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
											view.state === "confirm" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Button, {
												size: "sm",
												variant: "outline",
												disabled: !enabled || busy,
												onClick: () => invoke("grant"),
												children: t("entry.daily.allow")
											}) : null,
											view.state === "controlled" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Button, {
												size: "sm",
												variant: "outline",
												disabled: busy,
												onClick: () => invoke("pause"),
												children: t(paused ? "entry.view.resume" : "entry.view.pause")
											}) : null,
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Button, {
												size: "sm",
												variant: "outline",
												disabled: busy,
												onClick: () => invoke("return"),
												children: t(view.state === "connecting" ? "entry.borrow.cancel" : "entry.borrow.return")
											})
										] })
									})
								]
							})
						})
					}),
					view?.error === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						role: "alert",
						className: "bh-browser-error",
						children: view.error
					}),
					error === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						role: "alert",
						className: "bh-browser-error",
						children: error
					})
				]
			});
		}
		//#endregion
		//#region packages/browser/src/client/borrowed-browser.tsx
		function BorrowedBrowser({ slug, tab, enabled, t, refresh }) {
			const [pair, setPair] = (0, react.useState)();
			const [busy, setBusy] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)();
			const active = (0, react.useRef)(false);
			const sequence = (0, react.useRef)(0);
			const resource = (0, react.useCallback)((node) => {
				active.current = node !== null;
				if (node === null) sequence.current += 1;
			}, []);
			const invoke = (action) => {
				if (slug === void 0 || busy) return;
				const request = ++sequence.current;
				setBusy(true);
				setError(void 0);
				setPair(void 0);
				fetch(`./api/browser/borrow/${action}`, {
					method: "POST",
					cache: "no-store",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ slug })
				}).then(async (response) => {
					const body = await response.json();
					if (!response.ok || !body.ok) throw new Error(body.error ?? t("entry.error"));
					if (!active.current || sequence.current !== request) return;
					if (action === "pair" && body.code !== void 0 && body.expiresAt !== void 0) setPair({
						code: body.code,
						expiresAt: body.expiresAt
					});
				}).catch((cause) => {
					if (active.current && sequence.current === request) setError(cause instanceof Error ? cause.message : t("entry.error"));
				}).finally(() => {
					if (active.current && sequence.current === request) {
						setBusy(false);
						refresh();
					}
				});
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				ref: resource,
				className: "bh-browser-body bh-browser-borrow",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SidebarCardList, {
					className: "bh-browser-cards",
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SidebarCardRow, {
						icon: "globe",
						title: t("settings.extension"),
						chips: tab == null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Tag, {
							tone: "neutral",
							children: t("entry.chip.notShared")
						}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Tag, {
							tone: "info",
							children: t("entry.chip.readOnly")
						}),
						meta: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t(tab == null ? "entry.borrow.none" : "entry.borrow.readOnly") }),
						detail: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "bh-browser-card-detail",
							children: [
								tab == null ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", {
									className: "bh-browser-borrow-title",
									children: tab.title || tab.url
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "bh-browser-borrow-url",
									children: tab.url
								})] }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Button, {
									size: "sm",
									variant: "outline",
									disabled: !enabled || busy,
									onClick: () => invoke(tab == null ? "pair" : "return"),
									children: t(tab == null ? "entry.borrow.pair" : "entry.borrow.return")
								}),
								tab != null || pair === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("entry.borrow.instructions") }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Input, {
										"aria-label": t("entry.borrow.code"),
										value: pair.code,
										readOnly: true
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: location.origin }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Button, {
										size: "sm",
										variant: "outline",
										onClick: () => {
											sequence.current += 1;
											setPair(void 0);
											invoke("return");
										},
										children: t("entry.borrow.cancel")
									})
								] })
							]
						})
					})
				}), error === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					role: "alert",
					className: "bh-browser-error",
					children: error
				})]
			});
		}
		//#endregion
		//#region packages/browser/src/client/styles.ts
		const styles = COMBOBOX_CSS + `
.bh-browser-access-control { position: relative; display: flex; align-items: center; }
.bh-browser-borrow { display: grid; gap: ${space.x3}; font-size: ${text.metaSize}; }
.bh-browser-borrow-title, .bh-browser-daily-install { color: var(--tobs-ink-primary); text-underline-offset: 3px; }
.bh-browser-borrow-url { overflow-wrap: anywhere; }
.bh-browser-borrow-url { color: var(--tobs-ink-secondary); }
.bh-browser-access-power {
  display: flex; align-items: center; justify-content: center; width: 28px; height: 28px;
  padding: 0; border: 0; border-radius: ${radius.md}; background: transparent;
  color: var(--tobs-ink-secondary); cursor: pointer;
}
.bh-browser-access-power:hover { background: var(--tobs-state-hover); }
.bh-browser-access-power[aria-pressed='true'] { color: var(--tobs-accent-ink); background: var(--tobs-state-hover); }
.bh-browser-access-power:focus-visible { outline: ${border.focus} solid var(--tobs-line-focus); outline-offset: 2px; }
.bh-browser-access-power:disabled { opacity: 0.5; cursor: default; }
.bh-browser-access-power.bh-access-failed { color: var(--tobs-status-danger-ink); }
.bh-browser-access-error { order: -1; padding: 0 ${space.x2}; color: var(--tobs-status-danger-ink); font-size: ${text.metaSize}; line-height: ${text.metaLine}; white-space: nowrap; }

.bh-browser-local { display: grid; gap: ${space.x3}; font-size: ${text.metaSize}; }
.bh-browser-card-detail { display: grid; gap: ${space.x3}; justify-items: start; font-size: ${text.metaSize}; }
.bh-browser-card-field { display: flex; align-items: center; justify-content: space-between; gap: ${space.x3}; width: 100%; color: var(--tobs-ink-secondary); }
.bh-browser-card-field > span:first-child { flex: none; }
.bh-browser-cards .bh-card-meta [role="status"] { color: inherit; }
.bh-browser-note { color: var(--tobs-ink-secondary); }
.bh-browser-frame { display: block; width: 100%; border: ${border.hairline} solid ${color.divider}; border-radius: ${radius.md}; }
.bh-browser-actions { display: flex; flex-wrap: wrap; gap: ${space.x3}; }
.bh-browser-tab[aria-pressed="true"] { background: var(--tobs-state-hover); }
.bh-browser-tab[aria-current="true"] .bh-browser-tab-title { font-weight: ${text.strong}; }
.bh-browser-tab .bh-browser-tab-url { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bh-browser-tabs .bh-card-main { padding: ${space.x3} ${space.x3}; }
.bh-browser-error { color: var(--tobs-status-danger-ink); overflow-wrap: anywhere; }
.bh-viewer-btn-content { display: inline-flex; align-items: center; gap: ${space.x2}; }
@media (max-width: 560px) {
  [data-bh-viewer-btn-label] { display: none; }
}
.bh-browser-progress { display: grid; gap: ${space.x2}; color: var(--tobs-ink-secondary); }
.bh-browser-progress-bar { width: 100%; height: 6px; accent-color: var(--tobs-accent-solid); }
.bh-browser-failure { display: grid; gap: ${space.x2}; overflow-wrap: anywhere; }
.bh-browser-failure-title { color: var(--tobs-ink-primary); font-weight: ${text.strong}; }
.bh-browser-failure-fault, .bh-browser-failure-action { color: var(--tobs-ink-secondary); }
.bh-browser-failure-details { color: var(--tobs-ink-secondary); }
.bh-browser-failure-details pre { overflow-x: auto; white-space: pre-wrap; font-size: ${text.metaSize}; }

@property --x-backgroundColor { syntax: "*"; inherits: false;}
.bhx-level-0{}
@keyframes bhx18re5ia-B{from{opacity:0;}to{opacity:1;}}
.bhxvn5hdi{--tobs-on-field:var(--tobs-style-on-card-field)}
.bhxwe5oui{--tobs-on-field-edge:var(--tobs-style-on-card-field-edge)}
.bhxweo6jt{--tobs-on-secondary:var(--tobs-style-on-card-secondary)}
.bhx1f506l2{--tobs-on-secondary-edge:var(--tobs-style-on-card-secondary-edge)}
.bhxgbxpun{--tobs-on-track:var(--tobs-style-on-card-track)}
.bhx-level-1:not(#\\#){}
.bhxln7xf2:not(#\\#){font:inherit}
.bhx10a8y8t:not(#\\#){inset:0}
.bhx1ghz6dp:not(#\\#){margin:0}
.bhx1717udv:not(#\\#){padding:0}
.bhx1tsjn1a:not(#\\#){padding:16px}
.bhx-level-2:not(#\\#):not(#\\#){}
.bhx7vmdhn:not(#\\#):not(#\\#){border-color:var(--tobs-line-edge)}
.bhx1cx41gz:not(#\\#):not(#\\#){border-radius:4px}
.bhx13u8aww:not(#\\#):not(#\\#){border-radius:50%}
.bhx1hir1rn:not(#\\#):not(#\\#){border-radius:9999px}
.bhxdylm0v:not(#\\#):not(#\\#){border-radius:var(--tobs-style-list-group-radius)}
.bhx1voi8sm:not(#\\#):not(#\\#){border-radius:var(--tobs-style-list-item-radius)}
.bhxov8xcf:not(#\\#):not(#\\#){border-radius:var(--tobs-style-radius-card)}
.bhx10e1no3:not(#\\#):not(#\\#){border-radius:var(--tobs-style-radius-container)}
.bhxamr80a:not(#\\#):not(#\\#){border-radius:var(--tobs-style-radius-control)}
.bhxvz6vxc:not(#\\#):not(#\\#){border-radius:var(--tobs-style-radius-control)}
.bhx1i9s7pd:not(#\\#):not(#\\#){border-radius:var(--tobs-style-radius-menu)}
.bhx4g09nt:not(#\\#):not(#\\#){border-radius:var(--tobs-style-radius-small)}
.bhxbsl7fq:not(#\\#):not(#\\#){border-style:dashed}
.bhx1y0btm7:not(#\\#):not(#\\#){border-style:solid}
.bhxc342km:not(#\\#):not(#\\#){border-width:0}
.bhx1sfpsak:not(#\\#):not(#\\#){border-width:1px}
.bhx3psx0u:not(#\\#):not(#\\#){flex:0 0 auto}
.bhx12lumcd:not(#\\#):not(#\\#){flex:1 1 auto}
.bhx1mckxr8:not(#\\#):not(#\\#){gap:12px}
.bhxfe3e77:not(#\\#):not(#\\#){gap:12px}
.bhx1c459s5:not(#\\#):not(#\\#){gap:2px}
.bhx5v8n67:not(#\\#):not(#\\#){gap:2px}
.bhx12e6dxb:not(#\\#):not(#\\#){gap:4px}
.bhx1e5nl48:not(#\\#):not(#\\#){gap:4px}
.bhx2zm2ee:not(#\\#):not(#\\#){gap:8px}
.bhxvdlyrv:not(#\\#):not(#\\#){gap:8px}
.bhx103m73q:not(#\\#):not(#\\#){gap:var(--tobs-style-list-gap)}
.bhx1d3k6p2:not(#\\#):not(#\\#){margin-block:12px}
.bhx14t6loe:not(#\\#):not(#\\#){margin-block:2px}
.bhx14zrpzh:not(#\\#):not(#\\#){margin-inline:2px}
.bhxw7g2o2:not(#\\#):not(#\\#){margin-inline:4px}
.bhx1a2a7pz:not(#\\#):not(#\\#){outline:none}
.bhx7giv3:not(#\\#):not(#\\#){overflow:clip}
.bhxb3r6kr:not(#\\#):not(#\\#){overflow:hidden}
.bhxt970qd:not(#\\#):not(#\\#){padding-block:0}
.bhxgxqyfi:not(#\\#):not(#\\#){padding-block:1px}
.bhx1tv32aw:not(#\\#):not(#\\#){padding-block:24px}
.bhx1bcthrq:not(#\\#):not(#\\#){padding-block:2px}
.bhx89kiln:not(#\\#):not(#\\#){padding-block:4px}
.bhx1kz1gct:not(#\\#):not(#\\#){padding-block:8px}
.bhxggp0jn:not(#\\#):not(#\\#){padding-block:var(--tobs-style-list-group-padding-block)}
.bhx1nxcsqp:not(#\\#):not(#\\#){padding-block:var(--tobs-style-list-item-padding-block)}
.bhx1vid4s1:not(#\\#):not(#\\#){padding-inline:12px 8px}
.bhxq23ktl:not(#\\#):not(#\\#){padding-inline:12px}
.bhx1xa34d1:not(#\\#):not(#\\#){padding-inline:16px}
.bhx1w8vjyx:not(#\\#):not(#\\#){padding-inline:4px}
.bhx7em7do:not(#\\#):not(#\\#){padding-inline:4px}
.bhx14i569m:not(#\\#):not(#\\#){padding-inline:8px}
.bhx1j7gxbw:not(#\\#):not(#\\#){padding-inline:8px}
.bhxpd76p7:not(#\\#):not(#\\#){padding-inline:calc(var(--tobs-style-list-group-padding-inline) + var(--tobs-style-list-item-padding))}
.bhxf5xh8h:not(#\\#):not(#\\#){padding-inline:var(--tobs-style-list-group-padding-inline)}
.bhx1avbwx3:not(#\\#):not(#\\#){padding-inline:var(--tobs-style-list-item-padding)}
.bhx1ku5rj1:not(#\\#):not(#\\#){place-items:center}
.bhx1i94p6w:focus-visible:not(#\\#):not(#\\#){outline:2px solid var(--tobs-accent-focus)}
.bhxay4pf5:focus-within:not(#\\#):not(#\\#){outline:2px solid var(--tobs-accent-focus)}
.bhx1m95a6t:focus-visible:not(#\\#):not(#\\#){outline:2px solid var(--tobs-accent-solid)}
.bhxup6t74:not(:empty):not(:has(> :is([data-settings-row], [data-settings-part], section))):not(#\\#):not(#\\#){padding-block:calc(var(--tobs-style-list-group-padding-block) + var(--tobs-style-list-item-padding-block))}
.bhx1decy8s:not(:empty):not(:has(> :is([data-settings-row], [data-settings-part], section))):not(#\\#):not(#\\#){padding-inline:calc(var(--tobs-style-list-group-padding-inline) + var(--tobs-style-list-item-padding))}
.bhxtm8dy7:has(> section):not(#\\#):not(#\\#){border-radius:0}
.bhx38levs:has(:focus-visible):not(#\\#):not(#\\#){outline:2px solid var(--tobs-accent-focus)}
.bhxvz3fld:has(> section):not(#\\#):not(#\\#){padding-block:0}
.bhx1qyef7o:has(> section):not(#\\#):not(#\\#){padding-inline:0}
@media (max-width: 648px){.bhx32nsh3.bhx32nsh3:not(#\\#):not(#\\#){gap:8px}}
@container bh-settings (max-width: 480px){.bhx1bsqh3l.bhx1bsqh3l:not(#\\#):not(#\\#){gap:8px}}
.bhx-level-3:not(#\\#):not(#\\#):not(#\\#){}
.bhx1g31g6d:not(#\\#):not(#\\#):not(#\\#){accent-color:var(--tobs-accent-solid)}
.bhx6s0dn4:not(#\\#):not(#\\#):not(#\\#){align-items:center}
.bhx1cy8zhl:not(#\\#):not(#\\#):not(#\\#){align-items:flex-start}
.bhx1qjc9v5:not(#\\#):not(#\\#):not(#\\#){align-items:stretch}
.bhx1cbrp87:not(#\\#):not(#\\#):not(#\\#){animation-duration:120ms}
.bhxpv5g7k:not(#\\#):not(#\\#):not(#\\#){animation-name:bhx18re5ia-B}
.bhx2ebxmi:not(#\\#):not(#\\#):not(#\\#){aspect-ratio:16 / 10}
.bhx1eunnl6:not(#\\#):not(#\\#):not(#\\#){background-color:color-mix(in srgb, var(--tobs-ink-primary) 8%, var(--tobs-layer-raised))}
.bhxjbqb8w:not(#\\#):not(#\\#):not(#\\#){background-color:transparent}
.bhxn8qxt5:not(#\\#):not(#\\#):not(#\\#){background-color:var(--tobs-accent-on-solid)}
.bhx1rolmtn:not(#\\#):not(#\\#):not(#\\#){background-color:var(--tobs-accent-solid)}
.bhx1m3nrc0:not(#\\#):not(#\\#):not(#\\#){background-color:var(--tobs-accent-tint)}
.bhx1nycijx:not(#\\#):not(#\\#):not(#\\#){background-color:var(--tobs-accent-tint)}
.bhxdoljrk:not(#\\#):not(#\\#):not(#\\#){background-color:var(--tobs-ink-primary)}
.bhx1k5awnc:not(#\\#):not(#\\#):not(#\\#){background-color:var(--tobs-layer-elevated)}
.bhxibs1lc:not(#\\#):not(#\\#):not(#\\#){background-color:var(--tobs-layer-elevated)}
.bhxp02wjs:not(#\\#):not(#\\#):not(#\\#){background-color:var(--tobs-layer-well)}
.bhx1tfgve3:not(#\\#):not(#\\#):not(#\\#){background-color:var(--tobs-line-divider)}
.bhxym0p2z:not(#\\#):not(#\\#):not(#\\#){background-color:var(--tobs-on-field, var(--tobs-style-on-page-field))}
.bhxooed33:not(#\\#):not(#\\#):not(#\\#){background-color:var(--tobs-on-secondary, var(--tobs-style-on-page-secondary))}
.bhx17wyupo:not(#\\#):not(#\\#):not(#\\#){background-color:var(--tobs-on-track, var(--tobs-style-on-page-track))}
.bhx1xojs80:not(#\\#):not(#\\#):not(#\\#){background-color:var(--tobs-state-hover)}
.bhxxt5fwl:not(#\\#):not(#\\#):not(#\\#){background-color:var(--tobs-state-selected)}
.bhxw91tbh:not(#\\#):not(#\\#):not(#\\#){background-color:var(--tobs-status-danger-tint)}
.bhx1q91288:not(#\\#):not(#\\#):not(#\\#){background-color:var(--tobs-status-success-tint)}
.bhxl8vzxm:not(#\\#):not(#\\#):not(#\\#){background-color:var(--tobs-status-warning-tint)}
.bhx18mhnxz:not(#\\#):not(#\\#):not(#\\#){background-color:var(--tobs-style-list-group-fill)}
.bhx1auanwt:not(#\\#):not(#\\#):not(#\\#){background-color:var(--tobs-style-list-item-fill)}
.bhx1x7efqg:not(#\\#):not(#\\#):not(#\\#){background-color:var(--tobs-style-switch-thumb-off-fill)}
.bhxl8spv7:not(#\\#):not(#\\#):not(#\\#){background-color:var(--x-backgroundColor)}
.bhx18o3ruo:not(#\\#):not(#\\#):not(#\\#){background-image:none}
.bhx1yc4nx5:not(#\\#):not(#\\#):not(#\\#){box-shadow:0 0 0 .5px var(--tobs-style-list-group-edge)}
.bhx1dm6lkz:not(#\\#):not(#\\#):not(#\\#){box-shadow:0 1px 2px var(--tobs-style-switch-thumb-off-shadow)}
.bhx1hle45t:not(#\\#):not(#\\#):not(#\\#){box-shadow:inset 0 0 0 1px var(--tobs-line-edge)}
.bhxnyootd:not(#\\#):not(#\\#):not(#\\#){box-shadow:inset 0 0 0 1px var(--tobs-line-edge)}
.bhx19f2fol:not(#\\#):not(#\\#):not(#\\#){box-shadow:inset 0 0 0 1px var(--tobs-line-strong)}
.bhx1ikcoup:not(#\\#):not(#\\#):not(#\\#){box-shadow:inset 0 0 0 1px var(--tobs-on-field-edge, var(--tobs-style-on-page-field-edge))}
.bhx1nopuv3:not(#\\#):not(#\\#):not(#\\#){box-shadow:inset 0 0 0 1px var(--tobs-on-secondary-edge, var(--tobs-style-on-page-secondary-edge))}
.bhx1gnnqk1:not(#\\#):not(#\\#):not(#\\#){box-shadow:none}
.bhxjtbsy0:not(#\\#):not(#\\#):not(#\\#){box-shadow:var(--tobs-elevation-1)}
.bhxb3z3mx:not(#\\#):not(#\\#):not(#\\#){box-shadow:var(--tobs-elevation-2)}
.bhx9f619:not(#\\#):not(#\\#):not(#\\#){box-sizing:border-box}
.bhx1hyvwdk:not(#\\#):not(#\\#):not(#\\#){clip-path:inset(50%)}
.bhx1heor9g:not(#\\#):not(#\\#):not(#\\#){color:inherit}
.bhxigofnc:not(#\\#):not(#\\#):not(#\\#){color:var(--tobs-accent-ink)}
.bhx14w2d3c:not(#\\#):not(#\\#):not(#\\#){color:var(--tobs-accent-on-solid)}
.bhxyja9ir:not(#\\#):not(#\\#):not(#\\#){color:var(--tobs-accent-solid)}
.bhx103lb5k:not(#\\#):not(#\\#):not(#\\#){color:var(--tobs-ink-primary)}
.bhx24dycr:not(#\\#):not(#\\#):not(#\\#){color:var(--tobs-ink-primary)}
.bhx14lg19:not(#\\#):not(#\\#):not(#\\#){color:var(--tobs-ink-secondary)}
.bhxr3raxm:not(#\\#):not(#\\#):not(#\\#){color:var(--tobs-ink-secondary)}
.bhx1axu3v7:not(#\\#):not(#\\#):not(#\\#){color:var(--tobs-ink-tertiary)}
.bhxwq55zj:not(#\\#):not(#\\#):not(#\\#){color:var(--tobs-ink-tertiary)}
.bhxwm96u7:not(#\\#):not(#\\#):not(#\\#){color:var(--tobs-layer-canvas)}
.bhx1btfezm:not(#\\#):not(#\\#):not(#\\#){color:var(--tobs-state-selected-ink)}
.bhx8ay0r6:not(#\\#):not(#\\#):not(#\\#){color:var(--tobs-status-danger-base)}
.bhx1cq2c6i:not(#\\#):not(#\\#):not(#\\#){color:var(--tobs-status-danger-ink)}
.bhx1pideu2:not(#\\#):not(#\\#):not(#\\#){color:var(--tobs-status-success-base)}
.bhxcz3oas:not(#\\#):not(#\\#):not(#\\#){color:var(--tobs-status-success-ink)}
.bhxz9v26x:not(#\\#):not(#\\#):not(#\\#){color:var(--tobs-status-warning-base)}
.bhx65eiyc:not(#\\#):not(#\\#):not(#\\#){color:var(--tobs-status-warning-ink)}
.bhxv008iy:not(#\\#):not(#\\#):not(#\\#){color:var(--tobs-style-button-secondary-ink)}
.bhx19wxcwi:not(#\\#):not(#\\#):not(#\\#){color:var(--tobs-style-text-section-title)}
.bhx1146j2:not(#\\#):not(#\\#):not(#\\#){cursor:help}
.bhx1ypdohk:not(#\\#):not(#\\#):not(#\\#){cursor:pointer}
.bhx1lliihq:not(#\\#):not(#\\#):not(#\\#){display:block}
.bhxjp7ctv:not(#\\#):not(#\\#):not(#\\#){display:contents}
.bhx78zum5:not(#\\#):not(#\\#):not(#\\#){display:flex}
.bhxrvj5dj:not(#\\#):not(#\\#):not(#\\#){display:grid}
.bhx3nfvp2:not(#\\#):not(#\\#):not(#\\#){display:inline-flex}
.bhx1r8uery:not(#\\#):not(#\\#):not(#\\#){flex-basis:0}
.bhxdt5ytf:not(#\\#):not(#\\#):not(#\\#){flex-direction:column}
.bhx1q0g3np:not(#\\#):not(#\\#):not(#\\#){flex-direction:row}
.bhx1iyjqo2:not(#\\#):not(#\\#):not(#\\#){flex-grow:1}
.bhx2lah0s:not(#\\#):not(#\\#):not(#\\#){flex-shrink:0}
.bhxs83m0k:not(#\\#):not(#\\#):not(#\\#){flex-shrink:1}
.bhx1a02dak:not(#\\#):not(#\\#):not(#\\#){flex-wrap:wrap}
.bhxjb2p0i:not(#\\#):not(#\\#):not(#\\#){font-family:inherit}
.bhxmz2490:not(#\\#):not(#\\#):not(#\\#){font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
.bhxgowt09:not(#\\#):not(#\\#):not(#\\#){font-size:12px}
.bhxh82noc:not(#\\#):not(#\\#):not(#\\#){font-size:12px}
.bhx1cwq2zs:not(#\\#):not(#\\#):not(#\\#){font-size:calc(12px - 1px)}
.bhx1779mkw:not(#\\#):not(#\\#):not(#\\#){font-size:var(--tobs-style-text-ui-size)}
.bhx5g6txa:not(#\\#):not(#\\#):not(#\\#){font-size:var(--tobs-style-text-ui-size)}
.bhx134zi0a:not(#\\#):not(#\\#):not(#\\#){font-weight:400}
.bhxo1l8bm:not(#\\#):not(#\\#):not(#\\#){font-weight:400}
.bhx1nj67n:not(#\\#):not(#\\#):not(#\\#){font-weight:500}
.bhxc9sfzf:not(#\\#):not(#\\#):not(#\\#){font-weight:500}
.bhxk50ysn:not(#\\#):not(#\\#):not(#\\#){font-weight:500}
.bhxl56j7k:not(#\\#):not(#\\#):not(#\\#){justify-content:center}
.bhx13a6bvl:not(#\\#):not(#\\#):not(#\\#){justify-content:flex-end}
.bhx1qughib:not(#\\#):not(#\\#):not(#\\#){justify-content:space-between}
.bhx619ttb:not(#\\#):not(#\\#):not(#\\#){justify-items:start}
.bhxo5v014:not(#\\#):not(#\\#):not(#\\#){line-height:1}
.bhx12cu2lo:not(#\\#):not(#\\#):not(#\\#){line-height:16px}
.bhx1g71p44:not(#\\#):not(#\\#):not(#\\#){line-height:16px}
.bhxsxgpsl:not(#\\#):not(#\\#):not(#\\#){line-height:calc(16px + 1px)}
.bhx3350y7:not(#\\#):not(#\\#):not(#\\#){line-height:var(--tobs-style-text-ui-line)}
.bhxe5wb2f:not(#\\#):not(#\\#):not(#\\#){line-height:var(--tobs-style-text-ui-line)}
.bhxf9vgkq:not(#\\#):not(#\\#):not(#\\#){opacity:.72}
.bhxg01cxk:not(#\\#):not(#\\#):not(#\\#){opacity:0}
.bhx1hc1fzr:not(#\\#):not(#\\#):not(#\\#){opacity:1}
.bhx1g40iwv:not(#\\#):not(#\\#):not(#\\#){outline-offset:-1px}
.bhx1y3gkto:not(#\\#):not(#\\#):not(#\\#){outline-offset:1px}
.bhx18n8c13:not(#\\#):not(#\\#):not(#\\#){outline-offset:2px}
.bhx1hl8ikr:not(#\\#):not(#\\#):not(#\\#){outline-offset:2px}
.bhxkmyskz:not(#\\#):not(#\\#):not(#\\#){outline-offset:calc(-1 * 2px)}
.bhxj0a0fe:not(#\\#):not(#\\#):not(#\\#){overflow-wrap:anywhere}
.bhx1lo940d:not(#\\#):not(#\\#):not(#\\#){padding-inline-end:4px}
.bhxocwxb3:not(#\\#):not(#\\#):not(#\\#){padding-inline-start:8px}
.bhx47corl:not(#\\#):not(#\\#):not(#\\#){pointer-events:none}
.bhx10l6tqk:not(#\\#):not(#\\#):not(#\\#){position:absolute}
.bhxixxii4:not(#\\#):not(#\\#):not(#\\#){position:fixed}
.bhx1n2onr6:not(#\\#):not(#\\#):not(#\\#){position:relative}
.bhx2b8uid:not(#\\#):not(#\\#):not(#\\#){text-align:center}
.bhxp4054r:not(#\\#):not(#\\#):not(#\\#){text-align:end}
.bhx1yc453h:not(#\\#):not(#\\#):not(#\\#){text-align:start}
.bhxlyipyv:not(#\\#):not(#\\#):not(#\\#){text-overflow:ellipsis}
.bhxs12ov2:not(#\\#):not(#\\#):not(#\\#){transform:translate(calc((var(--tobs-style-switch-height) - var(--tobs-style-switch-thumb-off)) / 2),-50%)}
.bhxyl194i:not(#\\#):not(#\\#):not(#\\#){transform:translate(calc(var(--tobs-style-switch-width) - (var(--tobs-style-switch-height) + var(--tobs-style-switch-thumb-on)) / 2),-50%)}
.bhxtrec30:not(#\\#):not(#\\#):not(#\\#){transition-duration:120ms}
.bhxjk0iim:not(#\\#):not(#\\#):not(#\\#){transition-property:transform,width,height,background-color}
.bhxtp3wbg:not(#\\#):not(#\\#):not(#\\#){transition-timing-function:cubic-bezier(0.2, 0, 0, 1)}
.bhx87ps6o:not(#\\#):not(#\\#):not(#\\#){user-select:none}
.bhxxymvpz:not(#\\#):not(#\\#):not(#\\#){vertical-align:middle}
.bhxeaf4i8:not(#\\#):not(#\\#):not(#\\#){white-space:normal}
.bhxuxw1ft:not(#\\#):not(#\\#):not(#\\#){white-space:nowrap}
.bhx126k92a:not(#\\#):not(#\\#):not(#\\#){white-space:pre-wrap}
.bhxp6lfbs:not(#\\#):not(#\\#):not(#\\#){z-index:1100}
.bhx1i7x82i:not(#\\#):not(#\\#):not(#\\#){z-index:1200}
.bhxacn7go:is([data-highlighted]):not(#\\#):not(#\\#):not(#\\#){background-color:var(--tobs-state-hover)}
.bhxl8ll33:is([aria-pressed=true], [data-drag-over]):not(#\\#):not(#\\#):not(#\\#){background-color:var(--tobs-style-choice-selected-fill)}
.bhxd7xfip:is([data-danger] *):not(#\\#):not(#\\#):not(#\\#){color:inherit}
.bhx3h2lrv:is([aria-pressed=true], [data-drag-over]):not(#\\#):not(#\\#):not(#\\#){color:var(--tobs-style-choice-selected-ink)}
.bhx1m8qfh3:is([data-disabled]):not(#\\#):not(#\\#):not(#\\#){cursor:default}
.bhxxh3kiz:is([data-disabled]):not(#\\#):not(#\\#):not(#\\#){opacity:.5}
.bhxu7tw00:has(> section):not(#\\#):not(#\\#):not(#\\#){background-color:transparent}
.bhx6vyjea:has(> section):not(#\\#):not(#\\#):not(#\\#){box-shadow:none}
.bhxozmhvb:has(input:disabled):not(#\\#):not(#\\#):not(#\\#){opacity:.5}
.bhxtgyt42:disabled:not(#\\#):not(#\\#):not(#\\#){cursor:default}
.bhx1s07b3s:disabled:not(#\\#):not(#\\#):not(#\\#){cursor:not-allowed}
.bhx1lfpgzf:disabled:not(#\\#):not(#\\#):not(#\\#){opacity:.4}
.bhxijokvz:disabled:not(#\\#):not(#\\#):not(#\\#){opacity:.5}
.bhx8yp5u:hover:not(#\\#):not(#\\#):not(#\\#){background-color:color-mix(in srgb, var(--tobs-ink-primary) 13%, var(--tobs-layer-raised))}
.bhx1a36vn4:hover:not(#\\#):not(#\\#):not(#\\#){color:var(--tobs-ink-secondary)}
@media (max-width: 648px){.bhx15bqsqq.bhx15bqsqq:not(#\\#):not(#\\#):not(#\\#){align-items:stretch}}
@media (prefers-reduced-motion: reduce){.bhx1u6grsq.bhx1u6grsq:not(#\\#):not(#\\#):not(#\\#){animation-duration:0s}}
@media (max-width: 648px){.bhx1uptv2i.bhx1uptv2i:not(#\\#):not(#\\#):not(#\\#){flex-direction:column}}
@media (max-width: 648px){.bhx3xz8fp.bhx3xz8fp:not(#\\#):not(#\\#):not(#\\#){justify-content:flex-start}}
.bhx1n57e5r:hover:enabled:not(#\\#):not(#\\#):not(#\\#){background-color:var(--tobs-accent-solid-hover)}
.bhxqta4pg:hover:enabled:not(#\\#):not(#\\#):not(#\\#){background-color:var(--tobs-state-hover)}
.bhxfdnnug:hover:enabled:not(#\\#):not(#\\#):not(#\\#){background-image:linear-gradient(var(--tobs-state-hover),var(--tobs-state-hover))}
.bhx9mj4i6:active:enabled:not(#\\#):not(#\\#):not(#\\#){background-color:var(--tobs-state-pressed)}
@container bh-settings (max-width: 480px){.bhx4bgz6.bhx4bgz6:not(#\\#):not(#\\#):not(#\\#){align-items:stretch}}
@container bh-settings (max-width: 480px){.bhxcxmu7o.bhxcxmu7o:not(#\\#):not(#\\#):not(#\\#){flex-direction:column}}
@container bh-settings (max-width: 480px){.bhx403fy9.bhx403fy9:not(#\\#):not(#\\#):not(#\\#){justify-content:flex-start}}
.bhx-level-4:not(#\\#):not(#\\#):not(#\\#):not(#\\#){}
.bhx16stqrj:not(#\\#):not(#\\#):not(#\\#):not(#\\#){border-bottom-color:transparent}
.bhx1q0q8m5:not(#\\#):not(#\\#):not(#\\#):not(#\\#){border-bottom-style:solid}
.bhxxobqf9:not(#\\#):not(#\\#):not(#\\#):not(#\\#){border-bottom-width:1px}
.bhx1odvp7i:not(#\\#):not(#\\#):not(#\\#):not(#\\#){border-top-color:var(--tobs-line-divider)}
.bhx13fuv20:not(#\\#):not(#\\#):not(#\\#):not(#\\#){border-top-style:solid}
.bhxgm6bnx:not(#\\#):not(#\\#):not(#\\#):not(#\\#){border-top-width:1px}
.bhx5yr21d:not(#\\#):not(#\\#):not(#\\#):not(#\\#){height:100%}
.bhx121clqe:not(#\\#):not(#\\#):not(#\\#):not(#\\#){height:1px}
.bhxjm9jq1:not(#\\#):not(#\\#):not(#\\#):not(#\\#){height:1px}
.bhx17rw0jw:not(#\\#):not(#\\#):not(#\\#):not(#\\#){height:22px}
.bhxm58u58:not(#\\#):not(#\\#):not(#\\#):not(#\\#){height:24px}
.bhxdkzj7d:not(#\\#):not(#\\#):not(#\\#):not(#\\#){height:40px}
.bhxols6we:not(#\\#):not(#\\#):not(#\\#):not(#\\#){height:6px}
.bhxt7dq6l:not(#\\#):not(#\\#):not(#\\#):not(#\\#){height:auto}
.bhx1cbrj4c:not(#\\#):not(#\\#):not(#\\#):not(#\\#){height:var(--tobs-style-control-height-large)}
.bhxisypcw:not(#\\#):not(#\\#):not(#\\#):not(#\\#){height:var(--tobs-style-control-height)}
.bhxxevliy:not(#\\#):not(#\\#):not(#\\#):not(#\\#){height:var(--tobs-style-control-height)}
.bhx6nhqxt:not(#\\#):not(#\\#):not(#\\#):not(#\\#){height:var(--tobs-style-icon-size)}
.bhxe2ximv:not(#\\#):not(#\\#):not(#\\#):not(#\\#){height:var(--tobs-style-icon-slot)}
.bhx5ej1o7:not(#\\#):not(#\\#):not(#\\#):not(#\\#){height:var(--tobs-style-switch-height)}
.bhx15ro3sd:not(#\\#):not(#\\#):not(#\\#):not(#\\#){height:var(--tobs-style-switch-thumb-off)}
.bhx1xd5puz:not(#\\#):not(#\\#):not(#\\#):not(#\\#){height:var(--tobs-style-switch-thumb-on)}
.bhxu96u03:not(#\\#):not(#\\#):not(#\\#):not(#\\#){left:0}
.bhxes3if4:not(#\\#):not(#\\#):not(#\\#):not(#\\#){margin-top:2px}
.bhx8l92br:not(#\\#):not(#\\#):not(#\\#):not(#\\#){max-height:var(--available-height,70vh)}
.bhx193iq5w:not(#\\#):not(#\\#):not(#\\#):not(#\\#){max-width:100%}
.bhx1jkqq1h:not(#\\#):not(#\\#):not(#\\#):not(#\\#){max-width:280px}
.bhxxc7z9f:not(#\\#):not(#\\#):not(#\\#):not(#\\#){max-width:360px}
.bhxh9uqaf:not(#\\#):not(#\\#):not(#\\#):not(#\\#){max-width:60%}
.bhx74h4c1:not(#\\#):not(#\\#):not(#\\#):not(#\\#){max-width:min(320px,calc(100vw - 32px))}
.bhx2lwn1j:not(#\\#):not(#\\#):not(#\\#):not(#\\#){min-height:0}
.bhxov48po:not(#\\#):not(#\\#):not(#\\#):not(#\\#){min-height:24px}
.bhxpjic2s:not(#\\#):not(#\\#):not(#\\#):not(#\\#){min-height:28px}
.bhx1ty6q3q:not(#\\#):not(#\\#):not(#\\#):not(#\\#){min-height:32px}
.bhx1bciaxd:not(#\\#):not(#\\#):not(#\\#):not(#\\#){min-height:var(--tobs-style-row-list)}
.bhxeuugli:not(#\\#):not(#\\#):not(#\\#):not(#\\#){min-width:0}
.bhx1i9suas:not(#\\#):not(#\\#):not(#\\#):not(#\\#){min-width:120px}
.bhx1d77m7x:not(#\\#):not(#\\#):not(#\\#):not(#\\#){min-width:140px}
.bhx1oslful:not(#\\#):not(#\\#):not(#\\#):not(#\\#){min-width:22px}
.bhx1odjw0f:not(#\\#):not(#\\#):not(#\\#):not(#\\#){overflow-y:auto}
.bhx6qpzc:not(#\\#):not(#\\#):not(#\\#):not(#\\#){padding-bottom:8px}
.bhx8hsu8p:not(#\\#):not(#\\#):not(#\\#):not(#\\#){padding-top:16px}
.bhx1f2dah2:not(#\\#):not(#\\#):not(#\\#):not(#\\#){padding-top:2px}
.bhx13vifvy:not(#\\#):not(#\\#):not(#\\#):not(#\\#){top:0}
.bhxwa60dl:not(#\\#):not(#\\#):not(#\\#):not(#\\#){top:50%}
.bhxh8yej3:not(#\\#):not(#\\#):not(#\\#):not(#\\#){width:100%}
.bhx1i1rx1s:not(#\\#):not(#\\#):not(#\\#):not(#\\#){width:1px}
.bhx13k4gh1:not(#\\#):not(#\\#):not(#\\#):not(#\\#){width:20px}
.bhx1lify8o:not(#\\#):not(#\\#):not(#\\#):not(#\\#){width:24px}
.bhx1i1gie9:not(#\\#):not(#\\#):not(#\\#):not(#\\#){width:40px}
.bhx1bev70i:not(#\\#):not(#\\#):not(#\\#):not(#\\#){width:calc(100% - 2px * 2)}
.bhxezivpi:not(#\\#):not(#\\#):not(#\\#):not(#\\#){width:max-content}
.bhx1x2ywmj:not(#\\#):not(#\\#):not(#\\#):not(#\\#){width:var(--tobs-style-icon-size)}
.bhxtbbyp4:not(#\\#):not(#\\#):not(#\\#):not(#\\#){width:var(--tobs-style-icon-slot)}
.bhx16m33ld:not(#\\#):not(#\\#):not(#\\#):not(#\\#){width:var(--tobs-style-switch-thumb-off)}
.bhxxbn18l:not(#\\#):not(#\\#):not(#\\#):not(#\\#){width:var(--tobs-style-switch-thumb-on)}
.bhxhtpqs2:not(#\\#):not(#\\#):not(#\\#):not(#\\#){width:var(--tobs-style-switch-width)}
.bhx2jbcm5.bhx2jbcm5:where(.bhx-default-marker:has(~ :is([data-settings-row], [data-settings-part])) *):not(#\\#):not(#\\#):not(#\\#):not(#\\#){border-bottom-color:var(--tobs-style-list-separator)}
.bhx79v8zp:has(~ :is([data-settings-row], [data-settings-part])):not(#\\#):not(#\\#):not(#\\#):not(#\\#){border-bottom-color:var(--tobs-style-list-separator)}
.bhx10zg81t:first-child:not(#\\#):not(#\\#):not(#\\#):not(#\\#){padding-top:0}
@media (max-width: 648px){.bhx1cnm762.bhx1cnm762:not(#\\#):not(#\\#):not(#\\#):not(#\\#){max-width:100%}}
@container bh-settings (max-width: 480px){.bhx1r6q2vj.bhx1r6q2vj:not(#\\#):not(#\\#):not(#\\#):not(#\\#){max-width:100%}}
.bhx-level-5:not(#\\#):not(#\\#):not(#\\#):not(#\\#):not(#\\#){}
.bhx-level-6:not(#\\#):not(#\\#):not(#\\#):not(#\\#):not(#\\#):not(#\\#){}
.bhx-level-7:not(#\\#):not(#\\#):not(#\\#):not(#\\#):not(#\\#):not(#\\#):not(#\\#){}
.bhx-level-8:not(#\\#):not(#\\#):not(#\\#):not(#\\#):not(#\\#):not(#\\#):not(#\\#):not(#\\#){}
.bhx1t6c47z:not(#\\#):not(#\\#):not(#\\#):not(#\\#):not(#\\#):not(#\\#):not(#\\#):not(#\\#)::placeholder{color:var(--tobs-ink-tertiary)}
`;
		//#endregion
		//#region packages/browser/src/client/access-power-icon.tsx
		function AccessPowerIcon() {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
				width: "16",
				height: "16",
				viewBox: "0 0 24 24",
				fill: "none",
				stroke: "currentColor",
				strokeWidth: "2",
				strokeLinecap: "round",
				strokeLinejoin: "round",
				"aria-hidden": "true",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M12 2v10" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M18.4 6.6a9 9 0 1 1-12.77.04" })]
			});
		}
		//#endregion
		//#region packages/browser/src/client/viewer-icons.tsx
		function baseProps(size) {
			return {
				width: size,
				height: size,
				viewBox: "0 0 24 24",
				fill: "none",
				stroke: "currentColor",
				strokeWidth: 2,
				strokeLinecap: "round",
				strokeLinejoin: "round",
				"aria-hidden": true
			};
		}
		function TrackpadIcon({ size = 14 }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
				...baseProps(size),
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("rect", {
					x: "4",
					y: "5",
					width: "16",
					height: "14",
					rx: "3"
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("line", {
					x1: "12",
					y1: "12",
					x2: "12",
					y2: "15"
				})]
			});
		}
		function TakeoverIcon({ size = 14 }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
				...baseProps(size),
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
						cx: "10",
						cy: "8",
						r: "3.5"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M4 20c0-3.3 2.7-6 6-6 1.4 0 2.7.5 3.7 1.3" }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "m14.5 18.5 2.5 2.5 5-5.5" })
				]
			});
		}
		//#endregion
		//#region packages/browser/src/client/index.tsx
		const ENTRY_ID = "botharness-browser";
		const OBSERVATION_ENDPOINT = "./api/browser/observation";
		const TAKEOVER_ENDPOINT = "./api/browser/takeover";
		const OPEN_ENDPOINT = "./api/browser/open";
		const STOP_ENDPOINT = "./api/browser/stop";
		const baseRelative = (path) => path === null || path === void 0 ? void 0 : path.startsWith("/") ? `.${path}` : path;
		const name = "botharness-browser-client";
		const inject = [
			"channelSidebar",
			"connection",
			"locale"
		];
		let connectionRpc;
		async function requestJson(url, init) {
			const response = await fetch(url, {
				cache: "no-store",
				...init
			});
			const body = await response.json();
			if (!response.ok || body.ok === false) throw new BrowserApiError(body.error ?? `HTTP ${String(response.status)}`, body.code, body.detail, body.packages);
			return body;
		}
		const botInfoStores = /* @__PURE__ */ new Map();
		function botInfoStore(botSlug) {
			const key = botSlug ?? "";
			const existing = botInfoStores.get(key);
			if (existing !== void 0) return existing;
			const created = createBotInfoStore(botSlug);
			botInfoStores.set(key, created);
			return created;
		}
		function createBotInfoStore(botSlug) {
			let info = {
				displayName: void 0,
				browserAccess: void 0,
				browserProfile: void 0,
				profiles: []
			};
			const listeners = /* @__PURE__ */ new Set();
			let loadedAt = Number.NEGATIVE_INFINITY;
			const load = () => {
				const rpc = connectionRpc;
				if (rpc === void 0 || botSlug === void 0) return;
				rpc.call("/api", "botharness/list", { args: {} }).then((result) => {
					if (!result.ok) return;
					const bots = result.value.bots ?? [];
					const match = bots.find((bot) => bot.slug === botSlug);
					if (match === void 0) return;
					const profiles = [...new Set(bots.map((bot) => typeof bot.browserProfile === "string" ? bot.browserProfile : "").filter((name) => name !== ""))].sort();
					info = {
						displayName: typeof match.displayName === "string" && match.displayName.length > 0 ? match.displayName : void 0,
						browserAccess: match.browserAccess === true,
						browserProfile: typeof match.browserProfile === "string" && match.browserProfile !== "" ? match.browserProfile : void 0,
						profiles
					};
					for (const listener of listeners) listener();
				}).catch(() => void 0);
			};
			return {
				setAccess(enabled) {
					info = {
						...info,
						browserAccess: enabled
					};
					for (const listener of listeners) listener();
				},
				subscribe(listener) {
					if (listeners.size === 0 && Date.now() - loadedAt > 5e3) {
						loadedAt = Date.now();
						load();
					}
					listeners.add(listener);
					return () => {
						listeners.delete(listener);
					};
				},
				getSnapshot: () => info,
				refresh: load
			};
		}
		function observationUrl(botSlug, tabId) {
			const base = `${OBSERVATION_ENDPOINT}?slug=${encodeURIComponent(botSlug ?? "")}`;
			return tabId === void 0 || tabId === "" ? base : `${base}&tab=${encodeURIComponent(tabId)}`;
		}
		function createObservationStore(botSlug, observeResource) {
			let value;
			let tab;
			let stopObserving;
			let refreshing = false;
			let revision = 0;
			let refreshAgain = false;
			const listeners = /* @__PURE__ */ new Set();
			const refresh = async () => {
				if (refreshing) {
					refreshAgain = true;
					return;
				}
				refreshing = true;
				const requestedTab = tab;
				const requestedRevision = revision;
				try {
					const next = await requestJson(observationUrl(botSlug, requestedTab), { signal: AbortSignal.timeout(1e4) });
					if (tab === requestedTab && revision === requestedRevision) value = next;
				} catch (cause) {
					if (!(cause?.name === "TimeoutError") && tab === requestedTab && revision === requestedRevision) value = void 0;
				} finally {
					refreshing = false;
				}
				for (const listener of listeners) listener();
				if (refreshAgain && listeners.size > 0) {
					refreshAgain = false;
					refresh();
				}
			};
			return {
				subscribe(listener) {
					listeners.add(listener);
					if (listeners.size === 1) {
						const stopEvents = observeResource?.("browser", refresh);
						if (stopEvents === void 0) refresh();
						const stopKeepAlive = visibleInterval(() => void refresh(), 2e4);
						stopObserving = () => (stopEvents?.(), stopKeepAlive());
					}
					return () => {
						listeners.delete(listener);
						if (listeners.size === 0) {
							stopObserving?.();
							stopObserving = void 0;
						}
					};
				},
				getSnapshot: () => value,
				setTab(targetId) {
					tab = targetId;
					refresh();
				},
				confirmTakeover(active) {
					revision += 1;
					if (value !== void 0) value = {
						...value,
						takeover: active
					};
					for (const listener of listeners) listener();
				},
				refresh: () => void refresh()
			};
		}
		function BrowserHeaderAction({ botSlug, t, setExpandable, setExpanded }) {
			const store = botInfoStore(botSlug);
			const [busy, setBusy] = (0, react.useState)(false);
			const inFlight = (0, react.useRef)(false);
			const [error, setError] = (0, react.useState)(false);
			const subscribe = (listener) => {
				const sync = () => {
					setExpandable?.(store.getSnapshot().browserAccess !== void 0);
				};
				const unsubscribe = store.subscribe(() => {
					sync();
					listener();
				});
				sync();
				return unsubscribe;
			};
			const info = (0, react.useSyncExternalStore)(subscribe, store.getSnapshot);
			const accessOn = info.browserAccess === true;
			const onToggle = (next) => {
				const rpc = connectionRpc;
				if (rpc === void 0 || botSlug === void 0 || inFlight.current) return;
				inFlight.current = true;
				setBusy(true);
				setError(false);
				rpc.call("/api", "botharness/browserAccessSet", { args: {
					slug: botSlug,
					enabled: next
				} }).then((result) => {
					if (!result.ok) {
						setError(true);
						return;
					}
					const applied = result.value.bot?.browserAccess === true;
					store.setAccess(applied);
					setExpanded?.(applied);
				}).catch(() => {
					setError(true);
				}).finally(() => {
					inFlight.current = false;
					setBusy(false);
				});
			};
			const label = t(accessOn ? "entry.access.disable" : "entry.access.enable");
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
				className: "bh-browser-access-control",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Tooltip, {
					label: error ? t("entry.access.failed") + ": " + label : label,
					side: "bottom",
					delayMs: 500,
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: `bh-browser-access-power${error ? " bh-access-failed" : ""}`,
						"aria-label": label,
						"aria-pressed": accessOn,
						"aria-busy": busy,
						disabled: busy || botSlug === void 0 || connectionRpc === void 0 || info.browserAccess === void 0,
						onClick: () => onToggle(!accessOn),
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(AccessPowerIcon, {})
					})
				}), error ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: "bh-browser-access-error",
					role: "alert",
					title: t("entry.access.failed"),
					children: t("entry.access.failureHint")
				}) : null]
			});
		}
		function BrowserBody({ botSlug, t, observeResource }) {
			const [store] = (0, react.useState)(() => createObservationStore(botSlug, observeResource));
			const infoStore = botInfoStore(botSlug);
			const observation = (0, react.useSyncExternalStore)(store.subscribe, store.getSnapshot);
			const info = (0, react.useSyncExternalStore)(infoStore.subscribe, infoStore.getSnapshot);
			const [follow, setFollow] = (0, react.useState)(true);
			const [preview, setPreview] = (0, react.useState)(void 0);
			const [busy, setBusy] = (0, react.useState)(false);
			const errorId = (0, react.useId)();
			const [profileInvalid, setProfileInvalid] = (0, react.useState)(false);
			const [profileOverride, setProfileOverride] = (0, react.useState)(void 0);
			const [failure, setFailure] = (0, react.useState)(void 0);
			const [viewer, setViewer] = (0, react.useState)();
			const [interaction, setInteraction] = (0, react.useState)(false);
			const viewerScope = (0, react.useRef)("");
			const previousViewer = (0, react.useRef)({
				identity: "",
				url: void 0
			});
			const mounted = (0, react.useRef)(true);
			const viewerRequest = (0, react.useRef)(0);
			const interactionResource = (0, react.useCallback)((node) => {
				mounted.current = node !== null;
				if (node === null) viewerRequest.current += 1;
			}, []);
			const disableInteraction = (0, react.useCallback)(() => {
				viewerRequest.current += 1;
				setInteraction(false);
			}, []);
			const [inputMode, setInputMode] = (0, react.useState)(() => typeof window !== "undefined" && window.innerWidth < 768 && typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches ? "trackpad" : "direct");
			const finePointer = typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(pointer: fine)").matches;
			const showHeaderTakeover = inputMode === "direct" && finePointer;
			const tabs = observation?.tabs ?? [];
			const focused = observation?.focused ?? null;
			const currentTab = tabs.find((tab) => tab.current);
			const orderedTabs = currentTab === void 0 ? tabs : [currentTab, ...tabs.filter((tab) => !tab.current)];
			const cleanupRequired = observation?.cleanupRequired === true;
			const failureNotice = !cleanupRequired && failure !== void 0 && isBrowserFailureKind(failure.code) ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(BrowserFailureNotice, {
				failure,
				t,
				onRetry: () => invoke(OPEN_ENDPOINT, follow || preview === void 0 ? {} : { tab: preview })
			}) : null;
			let visibleError = failure?.message;
			if (cleanupRequired) visibleError = t("entry.view.cleanupFailed");
			if (failureNotice !== null) visibleError = void 0;
			const provisioning = observation?.provisioning ?? null;
			const paused = observation?.takeover === true;
			const viewerUrl = observation?.running === true && (observation?.target === "container" || observation?.target === "local") ? baseRelative(observation.viewerUrl) : void 0;
			const narrowViewer = typeof window !== "undefined" && window.innerWidth < 700;
			const viewerDesign = observation?.target === "local" && (inputMode === "trackpad" || narrowViewer) ? {
				width: 390,
				height: 700
			} : {
				width: 1024,
				height: 768
			};
			const identity = `${botSlug ?? ""}:${profileOverride ?? info.browserProfile ?? ""}:${observation?.target ?? ""}`;
			const scope = `${identity}:${viewerUrl ?? ""}`;
			const previous = previousViewer.current;
			if (viewerScope.current !== scope) {
				viewerScope.current = scope;
				viewerRequest.current += 1;
				previousViewer.current = {
					identity,
					url: viewerUrl
				};
				if (interaction) setInteraction(false);
				if ((previous.identity !== identity || previous.url !== void 0) && viewer !== void 0) setViewer(void 0);
			}
			if (!paused && interaction) setInteraction(false);
			const viewerTranslate = (key) => t(key);
			const postTakeoverEnable = () => {
				if (botSlug === void 0 || viewerUrl === void 0) return;
				const request = ++viewerRequest.current;
				const expectedScope = viewerScope.current;
				setBusy(true);
				setFailure(void 0);
				requestJson(TAKEOVER_ENDPOINT, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						slug: botSlug,
						active: true
					})
				}).then((result) => {
					if (mounted.current && request === viewerRequest.current && viewerScope.current === expectedScope) {
						store.confirmTakeover(result.takeover);
						setInteraction(result.takeover);
					}
				}).catch((cause) => {
					if (mounted.current && request === viewerRequest.current) setFailure(readFailure(cause));
				}).finally(() => {
					if (mounted.current) {
						setBusy(false);
						store.refresh();
					}
				});
			};
			const toggleTakeover = () => {
				if (interaction) {
					disableInteraction();
					if (observation?.handoffPending !== true) invoke(TAKEOVER_ENDPOINT, { active: false });
					return;
				}
				if (busy || botSlug === void 0 || viewerUrl === void 0) return;
				postTakeoverEnable();
			};
			const botName = info.displayName ?? botSlug ?? "";
			const takeoverTitle = interaction && paused ? `${t("entry.view.browserTitle", { name: botName })} · ${t("entry.takeover.active")}` : t("entry.view.browserTitle", { name: botName });
			const toggleRef = (0, react.useRef)(toggleTakeover);
			toggleRef.current = toggleTakeover;
			const messageResource = useMountedResource(() => {
				const onMessage = (event) => {
					const data = event.data;
					if (typeof window === "undefined" || event.origin !== window.location.origin) return;
					if (data === null || typeof data !== "object" || data.type !== "bh-takeover-toggle") return;
					if (![...document.querySelectorAll("iframe")].some((frame) => frame.contentWindow === event.source && (frame.getAttribute("src") ?? "").includes("/botharness-browser/viewer/"))) return;
					toggleRef.current();
				};
				window.addEventListener("message", onMessage);
				return () => window.removeEventListener("message", onMessage);
			}, []);
			const takeoverNote = (0, react.useRef)(void 0);
			const wantTakeoverNote = interaction && paused;
			if (takeoverNote.current !== wantTakeoverNote && typeof document !== "undefined") {
				takeoverNote.current = wantTakeoverNote;
				try {
					for (const frame of Array.from(document.querySelectorAll("iframe"))) if ((frame.getAttribute("src") ?? "").includes("/botharness-browser/viewer/")) frame.contentWindow?.postMessage({
						type: "bh-takeover-state",
						active: wantTakeoverNote
					}, window.location.origin);
				} catch {}
			}
			const bodyResource = (0, react.useCallback)((node) => {
				interactionResource(node);
				messageResource(node);
			}, [interactionResource, messageResource]);
			const invoke = (endpoint, body = {}) => {
				if (busy || botSlug === void 0) return;
				setBusy(true);
				setProfileInvalid(false);
				setFailure(void 0);
				requestJson(endpoint, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						slug: botSlug,
						...body
					})
				}).then((result) => {
					if (typeof result.takeover === "boolean") store.confirmTakeover(result.takeover);
					if (endpoint === OPEN_ENDPOINT && result.viewerUrl !== void 0 && result.viewerUrl !== null) {
						setViewer(baseRelative(result.viewerUrl));
						setInteraction(false);
					}
					if (endpoint === STOP_ENDPOINT) {
						setViewer(void 0);
						setInteraction(false);
					}
				}).catch((cause) => setFailure(readFailure(cause))).finally(() => {
					setBusy(false);
					store.refresh();
				});
			};
			const onFollow = (next) => {
				setFollow(next);
				if (next) {
					setPreview(void 0);
					store.setTab(void 0);
				} else {
					const selected = focused ?? preview;
					setPreview(selected);
					store.setTab(selected);
				}
			};
			const onSelectTab = (targetId) => {
				setFollow(false);
				setPreview(targetId);
				store.setTab(targetId);
			};
			const onPause = () => {
				disableInteraction();
				invoke(TAKEOVER_ENDPOINT, { active: !paused });
			};
			const currentProfile = profileOverride ?? info.browserProfile ?? "";
			const saveProfile = (name) => {
				const rpc = connectionRpc;
				if (rpc === void 0 || botSlug === void 0 || busy) return;
				const trimmed = name.trim();
				const next = trimmed === "default" ? "" : trimmed;
				if (next === currentProfile) {
					setProfileInvalid(false);
					setFailure(void 0);
					return;
				}
				disableInteraction();
				setViewer(void 0);
				setBusy(true);
				setProfileInvalid(false);
				setFailure(void 0);
				rpc.call("/api", "botharness/browserProfileSet", { args: {
					slug: botSlug,
					profile: next
				} }).then((result) => {
					if (!result.ok) {
						setProfileInvalid(true);
						setFailure({ message: result.error?.message ?? t("entry.profile.failed") });
						return;
					}
					const value = result.value;
					setProfileOverride(typeof value.bot?.browserProfile === "string" ? value.bot.browserProfile : "");
					setPreview(void 0);
					store.setTab(void 0);
					infoStore.refresh();
				}).catch((cause) => {
					setProfileInvalid(true);
					setFailure(readFailure(cause));
				}).finally(() => {
					setBusy(false);
					store.refresh();
				});
			};
			if (!cleanupRequired && observation?.target === "profile-control") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ProfileBrowserControl, {
				slug: botSlug,
				view: observation.profile,
				enabled: info.browserAccess === true,
				paused,
				t,
				refresh: store.refresh
			}, botSlug);
			if (!cleanupRequired && observation?.target === "daily-control") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(DailyBrowserControl, {
				slug: botSlug,
				view: observation.daily ?? null,
				enabled: info.browserAccess === true,
				paused,
				t,
				refresh: store.refresh
			}, botSlug);
			if (!cleanupRequired && observation?.target === "extension") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(BorrowedBrowser, {
				slug: botSlug,
				tab: observation.borrowed,
				enabled: info.browserAccess === true,
				t,
				refresh: store.refresh
			}, botSlug);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				ref: bodyResource,
				className: "bh-browser-body bh-browser-local",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SidebarCardList, {
						className: "bh-browser-cards",
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SidebarCardRow, {
							icon: "globe",
							title: t(observation?.target === "container" ? "settings.container" : "settings.local"),
							chips: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [observation?.running === true ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Tag, {
								tone: "success",
								children: t("entry.chip.running")
							}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Tag, {
								tone: "neutral",
								children: t("entry.chip.stopped")
							}), paused ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Tag, {
								tone: "warning",
								children: t("entry.chip.paused")
							}) : null] }),
							detail: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "bh-browser-card-detail",
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: "bh-browser-card-field",
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("entry.profile.label") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ProfileCombobox, {
											value: currentProfile,
											profiles: [...info.profiles, ...observation?.profiles ?? []],
											disabled: busy || cleanupRequired || botSlug === void 0,
											invalid: profileInvalid,
											errorId,
											onSelect: saveProfile,
											t
										})]
									}),
									viewerUrl === void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: "bh-browser-card-field",
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("entry.view.follow") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Switch, {
											checked: follow,
											onChange: onFollow,
											label: t("entry.view.follow"),
											disabled: botSlug === void 0
										})]
									}) : null,
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: "bh-browser-actions",
										children: [
											viewerUrl === void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Button, {
												size: "sm",
												variant: "primary",
												disabled: busy || cleanupRequired,
												onClick: () => invoke(OPEN_ENDPOINT, follow || preview === void 0 ? {} : { tab: preview }),
												children: t(busy ? "entry.view.opening" : "entry.view.open")
											}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Button, {
												size: "sm",
												variant: "primary",
												disabled: busy || cleanupRequired,
												title: t("entry.view.fullscreen"),
												onClick: () => {
													if (viewerUrl !== void 0) setViewer(viewerUrl);
												},
												children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
													className: "bh-viewer-btn-content",
													children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {
														name: "maximize",
														size: 14
													}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
														"data-bh-viewer-btn-label": true,
														children: t("entry.view.fullscreen")
													})]
												})
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Button, {
												size: "sm",
												variant: "outline",
												disabled: busy || cleanupRequired,
												onClick: onPause,
												children: t(paused ? "entry.view.resume" : "entry.view.pause")
											}),
											observation?.running === true || cleanupRequired ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Button, {
												size: "sm",
												variant: "outline",
												disabled: busy,
												onClick: () => invoke(STOP_ENDPOINT),
												children: t("entry.view.stop")
											}) : null
										]
									})
								]
							})
						})
					}),
					viewerUrl === void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(react_jsx_runtime.Fragment, { children: observation?.frame === null || observation?.frame === void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "bh-browser-note",
						children: t("entry.view.noFrame")
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("img", {
						className: "bh-browser-frame",
						src: observation.frame,
						alt: t("entry.label")
					}) }) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(RemoteViewer, {
						t: viewerTranslate,
						title: takeoverTitle,
						src: `${viewerUrl}${viewerUrl.includes("?") ? "&" : "?"}mode=${inputMode}`,
						design: viewerDesign,
						notice: failure === void 0 ? void 0 : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							role: "alert",
							className: "bh-browser-error",
							children: failure.message
						}),
						busy,
						stopping: false,
						hideStop: true,
						hideInteractiveToggle: true,
						allowFrameInput: true,
						onStop: () => invoke(STOP_ENDPOINT),
						interactive: interaction && paused,
						onToggleInteractive: toggleTakeover,
						onDisableInteraction: disableInteraction,
						expanded: viewer === viewerUrl,
						onExpandedChange: (next) => {
							setViewer(next ? viewerUrl : void 0);
							if (!next) disableInteraction();
						},
						extraControls: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [showHeaderTakeover ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Button, {
							size: "sm",
							variant: "outline",
							disabled: busy,
							"aria-pressed": false,
							title: t("entry.view.inputMode.trackpad"),
							onClick: () => setInputMode("trackpad"),
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: "bh-viewer-btn-content",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(TrackpadIcon, {}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									"data-bh-viewer-btn-label": true,
									children: t("entry.view.inputMode.trackpad")
								})]
							})
						}) : null, showHeaderTakeover ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Button, {
							size: "sm",
							variant: interaction ? "ghost" : "primary",
							disabled: busy,
							"aria-pressed": interaction,
							title: t(interaction ? "entry.takeover.stop" : "entry.takeover.start"),
							onClick: toggleTakeover,
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: "bh-viewer-btn-content",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(TakeoverIcon, {}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									"data-bh-viewer-btn-label": true,
									children: t(interaction ? "entry.takeover.stop" : "entry.takeover.start")
								})]
							})
						}) : null] })
					}, scope),
					tabs.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "bh-browser-note",
						children: t("entry.view.noTabs")
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
						className: "bh-card-list bh-browser-tabs",
						"aria-label": t("entry.view.tabs"),
						children: orderedTabs.map((tab) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("li", {
							className: "bh-card-row",
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "bh-card-line",
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
									type: "button",
									className: "bh-card-main bh-browser-tab",
									"aria-current": tab.current ? true : void 0,
									"aria-pressed": tab.targetId === focused,
									title: tab.url,
									onClick: () => onSelectTab(tab.targetId),
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "bh-card-icon",
										children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ChannelSidebarIcon, {
											name: "panels-top-left",
											size: 16
										})
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
										className: "bh-card-body",
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: "bh-card-title bh-browser-tab-title",
											children: tab.title === "" ? tab.url : tab.title
										}), tab.title === "" ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: "bh-card-meta bh-browser-tab-url",
											children: tab.url
										})]
									})]
								})
							})
						}, tab.targetId))
					}),
					provisioning !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(BrowserProvisionProgress, {
						progress: provisioning,
						t
					}) : null,
					failureNotice,
					visibleError !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						id: errorId,
						role: "alert",
						className: "bh-browser-error",
						children: visibleError
					}) : null
				]
			});
		}
		function createBrowserBody(t, observeResource) {
			return function BrowserBodyView(props) {
				(0, react.useState)(() => recordViewerOpen(connectionRpc, "browser"));
				const store = botInfoStore(props.botSlug);
				if ((0, react.useSyncExternalStore)(store.subscribe, store.getSnapshot).browserAccess === false) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(PanelEmptyState, {
					icon: "globe",
					children: t("entry.access.description")
				});
				return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(BrowserBody, {
					...props,
					t,
					observeResource
				});
			};
		}
		function createBrowserBadge(t) {
			return function BrowserBadge({ botSlug }) {
				const store = botInfoStore(botSlug);
				if ((0, react.useSyncExternalStore)(store.subscribe, store.getSnapshot).browserAccess !== true) return null;
				return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: "bh-channel-sidebar-live-dot",
					role: "img",
					"aria-label": t("entry.access.on")
				});
			};
		}
		function createBrowserHeader(t) {
			return function BrowserHeaderView(props) {
				return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(BrowserHeaderAction, {
					...props,
					t
				}, props.botSlug);
			};
		}
		function apply(ctx) {
			botInfoStores.clear();
			const t = ctx.locale.bind(LOCALE_NS);
			registerBrowserSettings(ctx, t);
			ctx.effect(() => {
				const sheet = document.createElement("style");
				sheet.dataset.plugin = "@botharness/browser";
				sheet.dataset.pluginCss = "@botharness/browser/client.css";
				sheet.textContent = styles;
				document.head.append(sheet);
				return () => sheet.remove();
			}, "botharness-browser: styles");
			ctx.effect(() => ctx.locale.register(LOCALE_NS, {
				zh,
				en
			}), "botharness-browser: dictionaries");
			ctx.inject(["channelSidebar", "connection"], (sidebarCtx) => {
				const registry = sidebarCtx.channelSidebar;
				connectionRpc = sidebarCtx.connection?.rpc;
				if (registry === void 0) return;
				ctx.effect(() => registry.register({
					id: ENTRY_ID,
					icon: "globe",
					label: t("entry.label"),
					order: 41,
					scope: "personabot",
					component: createBrowserBody(t, sidebarCtx.get?.("botharnessResourceObserver")),
					headerAction: createBrowserHeader(t),
					badge: createBrowserBadge(t),
					tab: "screen"
				}), "botharness-browser: channel sidebar entry");
			});
		}
		//#endregion
		exports.apply = apply;
		exports.createObservationStore = createObservationStore;
		exports.inject = inject;
		exports.name = name;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map