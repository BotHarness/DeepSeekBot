window.__ModuleLoader__.load({
	id: "@botharness/browser",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		let react_dom = require("react-dom");
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
			"chevron-right": [["path", { d: "m9 18 6-6-6-6" }]],
			house: [["path", { d: "m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z" }]],
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
			plus: [["path", { d: "M5 12h14" }], ["path", { d: "M12 5v14" }]],
			user: [["path", { d: "M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" }], ["circle", {
				cx: "12",
				cy: "7",
				r: "4"
			}]],
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
			x: [["path", { d: "M18 6 6 18" }], ["path", { d: "m6 6 12 12" }]],
			check: [["path", { d: "M20 6 9 17l-5-5" }]]
		};
		function ChannelSidebarIcon({ name = "panels-top-left", size = 16 }) {
			const nodes = Object.hasOwn(glyphs, name) ? glyphs[name] : glyphs["panels-top-left"];
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
				width: size,
				height: size,
				viewBox: "0 0 24 24",
				fill: "none",
				stroke: "currentColor",
				strokeWidth: 2,
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
			bodySize: "13px",
			bodyLine: "20px",
			titleSize: "14px",
			titleLine: "20px",
			regular: "400",
			strong: "500"
		};
		const radius = {
			xs: "var(--dsw-radius-xs, 4px)",
			sm: "var(--dsw-radius-sm, 8px)",
			md: "var(--dsw-radius-md, 12px)",
			lg: "var(--dsw-radius-lg, 16px)",
			panel: "var(--dsw-radius-panel)",
			round: "50%"
		};
		const border = {
			hairline: "1px",
			focus: "var(--dsw-focus-ring-width, 2px)"
		};
		const color = {
			fg: "var(--dsw-alias-label-primary)",
			muted: "var(--dsw-alias-label-secondary)",
			subtle: "var(--dsw-alias-label-tertiary)",
			divider: "var(--dsw-alias-border-l1)",
			border: "var(--dsw-alias-border-l2)",
			borderStrong: "var(--dsw-alias-border-l3)",
			hover: "var(--dsw-alias-interactive-bg-hover)",
			selected: "var(--dsw-alias-interactive-bg-active)",
			navSelected: "var(--dsw-specific-sidebar-nav-item-active)",
			accent: "var(--dsw-alias-state-business-primary)",
			onAccent: "var(--dsw-alias-label-primary-foreground)",
			danger: "var(--dsw-alias-state-error-primary)",
			onDanger: "var(--dsw-alias-label-primary-foreground)",
			dangerEdge: "var(--dsw-alias-state-error-secondary)",
			dangerSoft: "var(--dsw-alias-interactive-bg-hover-danger)",
			warning: "var(--dsw-alias-state-warn-primary)",
			warningEdge: "var(--dsw-alias-state-warn-secondary)",
			warningSoft: "var(--dsw-alias-state-warn-tertiary)",
			success: "var(--dsw-alias-state-success-primary)",
			surface: "var(--dsw-alias-bg-module-platform)",
			elevated: "var(--dsw-alias-button-elevated-fill)",
			base: "var(--dsw-alias-bg-base)",
			well: "var(--dsw-alias-bg-base)",
			accentTint: "var(--dsw-alias-state-business-tertiary)"
		};
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
			labelSecondary: "var(--dsw-alias-label-secondary)",
			hoverFill: "var(--dsw-alias-interactive-bg-hover)",
			errorPrimary: "var(--dsw-alias-state-error-primary)",
			radiusMd: "var(--dsw-radius-md)",
			labelPrimary: "var(--dsw-alias-label-primary, #0f1115)",
			labelPrimaryForeground: "var(--dsw-alias-label-primary-foreground, #ffffff)",
			borderL2: "var(--dsw-alias-border-l2, #0000001a)",
			borderL3: "var(--dsw-alias-border-l3, #0000001f)",
			borderL4: "var(--dsw-alias-border-l4, #00000029)",
			bgBase: "var(--dsw-alias-bg-base, #ffffff)",
			buttonPrimaryFill: "var(--dsw-alias-button-primary-fill, #0f1115)",
			buttonElevatedFill: "var(--dsw-alias-button-elevated-fill, transparent)",
			businessPrimary: "var(--dsw-alias-state-business-primary, #4176e6)",
			hoverScrim: "color-mix(in srgb, var(--dsw-alias-bg-base) 35%, transparent)"
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
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
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
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(_deepseek_ai_dsh_client_ui_primitives.Pill, {
					onClick: onOpen,
					style: {
						background: BH.businessPrimary,
						color: BH.labelPrimaryForeground,
						height: 28,
						padding: "0 12px",
						fontSize: 13,
						gap: 6
					},
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconFullscreenOutlineRegular, { size: 14 }), t("entry.openFullscreen")]
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
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
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
					hideInteractiveToggle ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
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
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
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
		//#region packages/client/src/client/sidebar-card.tsx
		function SidebarCardList({ label, className, listRef, flush = false, children }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
				ref: listRef,
				"data-flush": flush || void 0,
				className: className === void 0 ? "bh-card-list" : "bh-card-list " + className,
				"aria-label": label,
				children
			});
		}
		function SidebarCardRow({ icon, leading, iconLabel, selection, title, titleClassName, badge, summary, flipKey, hint, chips, meta, trailing, detail, onClick, disabled, muted, mainClassName, dialog, expanded, controls, state, anchor }) {
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
						children: body
					}), trailing === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "bh-card-trailing",
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
							access !== "none" && installing === void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								size: "sm",
								variant: "primary",
								disabled: busy,
								onClick: onInstall,
								children: labels.install
							}) : null,
							access === "none" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
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
  color: var(--dsw-alias-label-secondary); background: transparent; cursor: pointer;
}
.bh-combobox-toggle:hover { background: var(--dsw-alias-interactive-bg-hover); }
.bh-combobox-toggle:disabled { opacity: 0.5; cursor: default; }
.bh-combobox-list {
  position: fixed; z-index: 1100; box-sizing: border-box;
  background: var(--dsw-alias-bg-base);
  --dsw-elevation-stroke-color: var(--dsw-alias-border-l1);
  box-shadow: var(--dsw-elevation-prominent);
}
.bh-combobox-scroll > button {
  display: flex; align-items: baseline; justify-content: space-between; gap: ${space.x4};
  width: 100%; min-height: 34px; padding: ${space.x2} ${space.x3};
  border: 0; border-radius: ${radius.sm}; background: transparent;
  color: var(--dsw-alias-label-primary); text-align: left; font: inherit; font-size: ${text.bodySize}; line-height: ${text.bodyLine}; cursor: pointer;
  overflow-wrap: anywhere;
}
.bh-combobox-scroll > button[aria-selected="true"] { font-weight: ${text.strong}; }
.bh-combobox-scroll > button:disabled { color: var(--dsw-alias-label-tertiary); cursor: default; }
.bh-combobox-scroll > button:not(:disabled):hover, .bh-combobox-scroll > button[data-active] {
  background: var(--dsw-alias-interactive-bg-hover);
}
.bh-combobox-scroll { max-height: 260px; overflow-y: auto; padding: ${space.x2}; box-sizing: border-box; }
.bh-combobox-hint { flex: none; color: var(--dsw-alias-label-secondary); font-size: ${text.metaSize}; font-weight: ${text.regular}; }
.bh-combobox-empty { padding: ${space.x2} ${space.x3}; color: var(--dsw-alias-label-secondary); font-size: ${text.bodySize}; }
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
			const position = (0, _deepseek_ai_dsh_client_ui_primitives.useAnchoredPosition)({
				open,
				anchorRef: root,
				panelRef: panel,
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
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
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
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronDownOutlineRegular, { size: 16 })
					}),
					open && !disabled && hasPopup ? (0, react_dom.createPortal)(/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.MenuSurface, {
						compact: true,
						ref: panel,
						id: listId,
						role: "listbox",
						"aria-label": label,
						className: "bh-combobox-list",
						style: {
							...position,
							width: root.current?.getBoundingClientRect().width ?? 200,
							visibility: position === null ? "hidden" : void 0
						},
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
									option.value === actionValue ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconPlusOutlineRegular, { size: 16 }) : null,
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
		//#region packages/client/src/client/ds/pill-button.tsx
		const pillStyles = { pill: {
			k1xSpc: "bhx3nfvp2",
			kGNEyG: "bhx6s0dn4",
			kOIVth: "bhx12e6dxb",
			ks0D6T: "bhx193iq5w",
			kZKoxP: "bhxxevliy",
			kg3NbH: "bhx1vid4s1",
			kMzoRj: "bhxc342km",
			kaIpWk: "bhx4g09nt",
			kWkggS: "bhxw43b1w bhx1lc0nsx",
			kMwMTN: "bhx24dycr",
			kMv6JI: "bhxjb2p0i",
			kGuDYH: "bhx5g6txa",
			kLWn49: "bhx3350y7",
			khDVqt: "bhxuxw1ft",
			kkrTdU: "bhx1ypdohk bhxtgyt42",
			kSiTet: "bhx1hc1fzr bhxijokvz",
			kI3sdo: "bhx1a2a7pz bhx1m95a6t",
			kInvED: "bhx1y3gkto",
			$$css: true
		} };
		//#endregion
		//#region packages/client/src/client/ds/select.tsx
		function Select({ label, value, options, onChange, disabled = false, align = "end", autoFocus = false }) {
			const [open, setOpen] = (0, react.useState)(false);
			const current = options.find((option) => option.value === value);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Menu, {
				open: open && !disabled,
				portal: true,
				align,
				items: options.map((option) => ({
					id: option.value,
					label: option.label
				})),
				selectedId: value,
				onSelect: (id) => {
					setOpen(false);
					const next = options.find((option) => option.value === id);
					if (next !== void 0 && next.value !== value) onChange(next.value);
				},
				onClose: () => {
					setOpen(false);
				},
				anchor: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
					type: "button",
					"aria-label": label,
					"aria-haspopup": "menu",
					"aria-expanded": open && !disabled,
					disabled,
					"data-modal-autofocus": autoFocus ? "" : void 0,
					onClick: () => {
						setOpen((previous) => !previous);
					},
					...props(pillStyles.pill),
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "bhxeuugli bhxb3r6kr bhxlyipyv bhxuxw1ft",
						children: current?.label
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "bhx3nfvp2 bhx2lah0s bhxr3raxm",
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronDownOutlineRegular, { size: 12 })
					})]
				})
			});
		}
		//#endregion
		//#region packages/client/src/client/ds/settings-row.tsx
		function SettingsRows({ children, rootRef }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				ref: rootRef,
				className: "bhx78zum5 bhxdt5ytf bhxeuugli",
				children
			});
		}
		function SettingsRow({ title, description, control, children, rootRef, data }) {
			const id = (0, react.useId)();
			const titleId = `${id}-title`;
			const descriptionId = `${id}-description`;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				ref: rootRef,
				role: "group",
				"aria-labelledby": titleId,
				"aria-describedby": description === void 0 ? void 0 : descriptionId,
				...data,
				className: "bhx78zum5 bhx6s0dn4 bhx15bqsqq bhx1q0g3np bhx1uptv2i bhx1mckxr8 bhxv0lzym bhxeuugli bhxe74ayl bhxrvphhj bhx1q0q8m5 bhxnoyelg bhx1bta2m4",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "bhx78zum5 bhxdt5ytf bhx5v8n67 bhx1iyjqo2 bhxs83m0k bhx1r8uery bhxeuugli",
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							id: titleId,
							className: "bhx24dycr bhxskcadq bhx1gy5ux2 bhx1nj67n bhxj0a0fe",
							children: title
						}),
						description === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							id: descriptionId,
							className: "bhxr3raxm bhxgowt09 bhx12cu2lo bhxj0a0fe",
							children: description
						}),
						children
					]
				}), control === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "bhx78zum5 bhx1a02dak bhx6s0dn4 bhx13a6bvl bhx3xz8fp bhx2zm2ee bhx2lah0s bhxeuugli bhxh9uqaf bhx1cnm762",
					children: control
				})]
			});
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
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(SettingsRows, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ConfigChoice, {
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
						chips: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [view?.paired !== true ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tag, {
							tone: "neutral",
							children: t("entry.chip.unpaired")
						}) : view.connected ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tag, {
							tone: "success",
							children: t("entry.chip.connected")
						}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tag, {
							tone: "warning",
							children: t("entry.chip.offline")
						}), paused ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tag, {
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
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
										size: "sm",
										variant: "outline",
										disabled: busy,
										onClick: () => invoke(view?.paired ? "forget" : "pair"),
										children: t(view?.paired ? "entry.profile.forget" : "entry.profile.pair")
									}), view?.connected ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
										size: "sm",
										variant: "outline",
										disabled: !enabled || busy,
										onClick: () => invoke("pause"),
										children: t(paused ? "entry.view.resume" : "entry.view.pause")
									}) : null]
								}),
								view?.paired || pair === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("entry.profile.instructions") }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
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
							chips: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [view === null || view.state === "error" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tag, {
								tone: "neutral",
								children: t("entry.chip.disconnected")
							}) : view.state === "connecting" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tag, {
								tone: "info",
								children: t("entry.chip.connecting")
							}) : view.state === "confirm" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tag, {
								tone: "warning",
								children: t("entry.chip.confirm")
							}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tag, {
								tone: "success",
								children: t("entry.chip.controlled")
							}), paused && view?.state === "controlled" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tag, {
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
										children: view === null || view.state === "error" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
											size: "sm",
											variant: "outline",
											disabled: !enabled || busy,
											onClick: () => invoke("connect"),
											children: t("entry.daily.connect")
										}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
											view.state === "confirm" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
												size: "sm",
												variant: "outline",
												disabled: !enabled || busy,
												onClick: () => invoke("grant"),
												children: t("entry.daily.allow")
											}) : null,
											view.state === "controlled" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
												size: "sm",
												variant: "outline",
												disabled: busy,
												onClick: () => invoke("pause"),
												children: t(paused ? "entry.view.resume" : "entry.view.pause")
											}) : null,
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
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
						chips: tab == null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tag, {
							tone: "neutral",
							children: t("entry.chip.notShared")
						}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tag, {
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
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
									size: "sm",
									variant: "outline",
									disabled: !enabled || busy,
									onClick: () => invoke(tab == null ? "pair" : "return"),
									children: t(tab == null ? "entry.borrow.pair" : "entry.borrow.return")
								}),
								tab != null || pair === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("entry.borrow.instructions") }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
										"aria-label": t("entry.borrow.code"),
										value: pair.code,
										readOnly: true
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: location.origin }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
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
.bh-browser-borrow-title, .bh-browser-daily-install { color: var(--dsw-alias-label-primary); text-underline-offset: 3px; }
.bh-browser-borrow-url { overflow-wrap: anywhere; }
.bh-browser-borrow-url { color: var(--dsw-alias-label-secondary); }
.bh-browser-access-power {
  display: flex; align-items: center; justify-content: center; width: 28px; height: 28px;
  padding: 0; border: 0; border-radius: ${radius.md}; background: transparent;
  color: var(--dsw-alias-label-secondary); cursor: pointer;
}
.bh-browser-access-power:hover { background: var(--dsw-alias-interactive-bg-hover); }
.bh-browser-access-power[aria-pressed='true'] { color: var(--dsw-alias-state-business-primary); background: var(--dsw-alias-interactive-bg-hover); }
.bh-browser-access-power:focus-visible { outline: ${border.focus} solid var(--dsw-alias-state-business-primary); outline-offset: 2px; }
.bh-browser-access-power:disabled { opacity: 0.5; cursor: default; }
.bh-browser-access-power.bh-access-failed { color: var(--dsw-alias-state-error-primary); }
.bh-browser-access-error { order: -1; padding: 0 ${space.x2}; color: var(--dsw-alias-state-error-primary); font-size: ${text.metaSize}; line-height: ${text.metaLine}; white-space: nowrap; }

.bh-browser-local { display: grid; gap: ${space.x3}; font-size: ${text.metaSize}; }
.bh-browser-card-detail { display: grid; gap: ${space.x3}; justify-items: start; font-size: ${text.metaSize}; }
.bh-browser-card-field { display: flex; align-items: center; justify-content: space-between; gap: ${space.x3}; width: 100%; color: var(--dsw-alias-label-secondary); }
.bh-browser-card-field > span:first-child { flex: none; }
.bh-browser-cards .bh-card-meta [role="status"] { color: inherit; }
.bh-browser-note { color: var(--dsw-alias-label-secondary); }
.bh-browser-frame { display: block; width: 100%; border: ${border.hairline} solid ${color.divider}; border-radius: ${radius.md}; }
.bh-browser-actions { display: flex; flex-wrap: wrap; gap: ${space.x3}; }
.bh-browser-tab[aria-pressed="true"] { background: var(--dsw-alias-interactive-bg-hover); }
.bh-browser-tab[aria-current="true"] .bh-browser-tab-title { font-weight: ${text.strong}; }
.bh-browser-tab .bh-browser-tab-url { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bh-browser-tabs .bh-card-main { padding: ${space.x3} ${space.x3}; }
.bh-browser-error { color: var(--dsw-alias-state-error-primary); overflow-wrap: anywhere; }
.bh-viewer-btn-content { display: inline-flex; align-items: center; gap: ${space.x2}; }
@media (max-width: 560px) {
  [data-bh-viewer-btn-label] { display: none; }
}
.bh-browser-progress { display: grid; gap: ${space.x2}; color: var(--dsw-alias-label-secondary); }
.bh-browser-progress-bar { width: 100%; height: 6px; accent-color: var(--dsw-alias-state-business-primary); }
.bh-browser-failure { display: grid; gap: ${space.x2}; overflow-wrap: anywhere; }
.bh-browser-failure-title { color: var(--dsw-alias-label-primary); font-weight: ${text.strong}; }
.bh-browser-failure-fault, .bh-browser-failure-action { color: var(--dsw-alias-label-secondary); }
.bh-browser-failure-details { color: var(--dsw-alias-label-secondary); }
.bh-browser-failure-details pre { overflow-x: auto; white-space: pre-wrap; font-size: ${text.metaSize}; }

.bhx-level-0{}
.bhx-level-1:not(#\\#){}
.bhx1ghz6dp:not(#\\#){margin:0}
.bhx1tsjn1a:not(#\\#){padding:16px}
.bhx-level-2:not(#\\#):not(#\\#){}
.bhx7vmdhn:not(#\\#):not(#\\#){border-color:var(--dsw-alias-border-l2)}
.bhx10e1no3:not(#\\#):not(#\\#){border-radius:var(--dsw-radius-md, 12px)}
.bhx4g09nt:not(#\\#):not(#\\#){border-radius:var(--dsw-radius-sm, 8px)}
.bhxbsl7fq:not(#\\#):not(#\\#){border-style:dashed}
.bhxc342km:not(#\\#):not(#\\#){border-width:0}
.bhx1sfpsak:not(#\\#):not(#\\#){border-width:1px}
.bhx1mckxr8:not(#\\#):not(#\\#){gap:12px}
.bhx5v8n67:not(#\\#):not(#\\#){gap:2px}
.bhx12e6dxb:not(#\\#):not(#\\#){gap:4px}
.bhx2zm2ee:not(#\\#):not(#\\#){gap:8px}
.bhx1d3k6p2:not(#\\#):not(#\\#){margin-block:12px}
.bhx1a2a7pz:not(#\\#):not(#\\#){outline:none}
.bhxb3r6kr:not(#\\#):not(#\\#){overflow:hidden}
.bhxe74ayl:not(#\\#):not(#\\#){padding-block:12px}
.bhx1tv32aw:not(#\\#):not(#\\#){padding-block:24px}
.bhx89kiln:not(#\\#):not(#\\#){padding-block:4px}
.bhx1vid4s1:not(#\\#):not(#\\#){padding-inline:12px 8px}
.bhx1xa34d1:not(#\\#):not(#\\#){padding-inline:16px}
.bhx1w8vjyx:not(#\\#):not(#\\#){padding-inline:4px}
.bhx1m95a6t:focus-visible:not(#\\#):not(#\\#){outline:var(--dsw-focus-ring-width, 2px) solid var(--dsw-alias-state-business-primary)}
@media (max-width: 648px){.bhxv0lzym.bhxv0lzym:not(#\\#):not(#\\#){gap:8px}}
.bhx-level-3:not(#\\#):not(#\\#):not(#\\#){}
.bhx1g31g6d:not(#\\#):not(#\\#):not(#\\#){accent-color:var(--dsw-alias-state-business-primary)}
.bhx6s0dn4:not(#\\#):not(#\\#):not(#\\#){align-items:center}
.bhxw43b1w:not(#\\#):not(#\\#):not(#\\#){background-color:var(--dsw-alias-bg-module-platform)}
.bhx1xojs80:not(#\\#):not(#\\#):not(#\\#){background-color:var(--dsw-alias-interactive-bg-hover)}
.bhx9f619:not(#\\#):not(#\\#):not(#\\#){box-sizing:border-box}
.bhx24dycr:not(#\\#):not(#\\#):not(#\\#){color:var(--dsw-alias-label-primary)}
.bhxr3raxm:not(#\\#):not(#\\#):not(#\\#){color:var(--dsw-alias-label-secondary)}
.bhxwq55zj:not(#\\#):not(#\\#):not(#\\#){color:var(--dsw-alias-label-tertiary)}
.bhx8ay0r6:not(#\\#):not(#\\#):not(#\\#){color:var(--dsw-alias-state-error-primary)}
.bhx1pideu2:not(#\\#):not(#\\#):not(#\\#){color:var(--dsw-alias-state-success-primary)}
.bhxz9v26x:not(#\\#):not(#\\#):not(#\\#){color:var(--dsw-alias-state-warn-primary)}
.bhx1ypdohk:not(#\\#):not(#\\#):not(#\\#){cursor:pointer}
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
.bhx5g6txa:not(#\\#):not(#\\#):not(#\\#){font-size:13px}
.bhxskcadq:not(#\\#):not(#\\#):not(#\\#){font-size:14px}
.bhx1nj67n:not(#\\#):not(#\\#):not(#\\#){font-weight:500}
.bhxl56j7k:not(#\\#):not(#\\#):not(#\\#){justify-content:center}
.bhx13a6bvl:not(#\\#):not(#\\#):not(#\\#){justify-content:flex-end}
.bhx619ttb:not(#\\#):not(#\\#):not(#\\#){justify-items:start}
.bhx12cu2lo:not(#\\#):not(#\\#):not(#\\#){line-height:16px}
.bhx1gy5ux2:not(#\\#):not(#\\#):not(#\\#){line-height:20px}
.bhx3350y7:not(#\\#):not(#\\#):not(#\\#){line-height:20px}
.bhx1hc1fzr:not(#\\#):not(#\\#):not(#\\#){opacity:1}
.bhx1y3gkto:not(#\\#):not(#\\#):not(#\\#){outline-offset:1px}
.bhxj0a0fe:not(#\\#):not(#\\#):not(#\\#){overflow-wrap:anywhere}
.bhx2b8uid:not(#\\#):not(#\\#):not(#\\#){text-align:center}
.bhxp4054r:not(#\\#):not(#\\#):not(#\\#){text-align:end}
.bhxlyipyv:not(#\\#):not(#\\#):not(#\\#){text-overflow:ellipsis}
.bhxuxw1ft:not(#\\#):not(#\\#):not(#\\#){white-space:nowrap}
.bhx126k92a:not(#\\#):not(#\\#):not(#\\#){white-space:pre-wrap}
.bhxtgyt42:disabled:not(#\\#):not(#\\#):not(#\\#){cursor:default}
.bhxijokvz:disabled:not(#\\#):not(#\\#):not(#\\#){opacity:.5}
.bhx1lc0nsx:hover:not(#\\#):not(#\\#):not(#\\#){background-color:var(--dsw-alias-interactive-bg-hover)}
@media (max-width: 648px){.bhx15bqsqq.bhx15bqsqq:not(#\\#):not(#\\#):not(#\\#){align-items:stretch}}
@media (max-width: 648px){.bhx1uptv2i.bhx1uptv2i:not(#\\#):not(#\\#):not(#\\#){flex-direction:column}}
@media (max-width: 648px){.bhx3xz8fp.bhx3xz8fp:not(#\\#):not(#\\#):not(#\\#){justify-content:flex-start}}
.bhx-level-4:not(#\\#):not(#\\#):not(#\\#):not(#\\#){}
.bhxnoyelg:not(#\\#):not(#\\#):not(#\\#):not(#\\#){border-bottom-color:var(--dsw-alias-border-l1)}
.bhx1q0q8m5:not(#\\#):not(#\\#):not(#\\#):not(#\\#){border-bottom-style:solid}
.bhxrvphhj:not(#\\#):not(#\\#):not(#\\#):not(#\\#){border-bottom-width:1px}
.bhxxevliy:not(#\\#):not(#\\#):not(#\\#):not(#\\#){height:28px}
.bhxdkzj7d:not(#\\#):not(#\\#):not(#\\#):not(#\\#){height:40px}
.bhxols6we:not(#\\#):not(#\\#):not(#\\#):not(#\\#){height:6px}
.bhx193iq5w:not(#\\#):not(#\\#):not(#\\#):not(#\\#){max-width:100%}
.bhxxc7z9f:not(#\\#):not(#\\#):not(#\\#):not(#\\#){max-width:360px}
.bhxh9uqaf:not(#\\#):not(#\\#):not(#\\#):not(#\\#){max-width:60%}
.bhxeuugli:not(#\\#):not(#\\#):not(#\\#):not(#\\#){min-width:0}
.bhx1e1oj2y:not(#\\#):not(#\\#):not(#\\#):not(#\\#){padding-bottom:4px}
.bhxb590mu:not(#\\#):not(#\\#):not(#\\#):not(#\\#){padding-top:16px}
.bhxh8yej3:not(#\\#):not(#\\#):not(#\\#):not(#\\#){width:100%}
.bhx1i1gie9:not(#\\#):not(#\\#):not(#\\#):not(#\\#){width:40px}
.bhx10zg81t:first-child:not(#\\#):not(#\\#):not(#\\#):not(#\\#){padding-top:0}
.bhx1bta2m4:last-child:not(#\\#):not(#\\#):not(#\\#):not(#\\#){border-bottom-color:transparent}
@media (max-width: 648px){.bhx1cnm762.bhx1cnm762:not(#\\#):not(#\\#):not(#\\#):not(#\\#){max-width:100%}}
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
		function createObservationStore(botSlug) {
			let value;
			let tab;
			let timer;
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
					const next = await requestJson(observationUrl(botSlug, requestedTab));
					if (tab === requestedTab && revision === requestedRevision) value = next;
				} catch {
					if (tab === requestedTab && revision === requestedRevision) value = void 0;
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
						refresh();
						timer = setInterval(() => void refresh(), 1500);
					}
					return () => {
						listeners.delete(listener);
						if (listeners.size === 0 && timer !== void 0) {
							clearInterval(timer);
							timer = void 0;
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
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tooltip, {
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
		function BrowserBody({ botSlug, t }) {
			const [store] = (0, react.useState)(() => createObservationStore(botSlug));
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
							chips: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [observation?.running === true ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tag, {
								tone: "success",
								children: t("entry.chip.running")
							}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tag, {
								tone: "neutral",
								children: t("entry.chip.stopped")
							}), paused ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tag, {
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
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("entry.view.follow") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Switch, {
											checked: follow,
											onChange: onFollow,
											label: t("entry.view.follow"),
											disabled: botSlug === void 0
										})]
									}) : null,
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: "bh-browser-actions",
										children: [
											viewerUrl === void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
												size: "sm",
												variant: "primary",
												disabled: busy || cleanupRequired,
												onClick: () => invoke(OPEN_ENDPOINT, follow || preview === void 0 ? {} : { tab: preview }),
												children: t(busy ? "entry.view.opening" : "entry.view.open")
											}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
												size: "sm",
												variant: "primary",
												disabled: busy || cleanupRequired,
												title: t("entry.view.fullscreen"),
												onClick: () => {
													if (viewerUrl !== void 0) setViewer(viewerUrl);
												},
												children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
													className: "bh-viewer-btn-content",
													children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconFullscreenOutlineRegular, { size: 14 }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
														"data-bh-viewer-btn-label": true,
														children: t("entry.view.fullscreen")
													})]
												})
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
												size: "sm",
												variant: "outline",
												disabled: busy || cleanupRequired,
												onClick: onPause,
												children: t(paused ? "entry.view.resume" : "entry.view.pause")
											}),
											observation?.running === true || cleanupRequired ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
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
						extraControls: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [showHeaderTakeover ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
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
						}) : null, showHeaderTakeover ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
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
		function createBrowserBody(t) {
			return function BrowserBodyView(props) {
				const store = botInfoStore(props.botSlug);
				if ((0, react.useSyncExternalStore)(store.subscribe, store.getSnapshot).browserAccess === false) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(PanelEmptyState, {
					icon: "globe",
					children: t("entry.access.description")
				});
				return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(BrowserBody, {
					...props,
					t
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
					component: createBrowserBody(t),
					headerAction: createBrowserHeader(t),
					badge: createBrowserBadge(t),
					tab: "screen"
				}), "botharness-browser: channel sidebar entry");
			});
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		exports.name = name;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map