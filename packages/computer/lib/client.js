window.__ModuleLoader__.load({
	id: "@botharness/computer",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		let react_jsx_runtime = require("react/jsx-runtime");
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
			base: "var(--dsw-alias-bg-base)"
		};
		//#endregion
		//#region packages/client/src/client/mounted-resource.ts
		function useMountedResource$1(start, dependencies) {
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
		const EXIT_REPORT = /^exited code=\d+$/;
		function isExitReport(detail) {
			return detail !== void 0 && EXIT_REPORT.test(detail);
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
			return useMountedResource$1((iframe) => {
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
			const resizeResource = useMountedResource$1((element) => {
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
			const dialogResource = useMountedResource$1((dialog) => {
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
		//#region packages/computer/src/client/viewer-events.ts
		const VIEWER_EVENT_ENDPOINT = "/api/computer/diagnostics/viewer";
		function viewerEventText(event) {
			switch (event.type) {
				case "mount": return "viewer mount docked";
				case "overlay": return event.open ? "viewer overlay open" : "viewer overlay closed";
				case "phase": return `viewer phase ${event.from}>${event.to}`;
				case "auto-reload": return `viewer auto-reload attempt=${String(event.attempt)}`;
				case "manual-retry": return "viewer manual-retry";
				case "loss-remount": return `viewer loss-remount streak=${String(event.streak)}`;
			}
		}
		async function reportViewerEvent(fetchImpl, detail) {
			try {
				await (fetchImpl ?? fetch)(VIEWER_EVENT_ENDPOINT, {
					method: "POST",
					credentials: "same-origin",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ detail })
				});
			} catch {}
		}
		//#endregion
		//#region packages/computer/src/client/locale.ts
		const LOCALE_NS = "botharness-computer";
		const zh = {
			"rows.target.title": "操作目标",
			"rows.target.description": "本 Profile 的所有 Bot 共用一个目标；切换后需要重新授权操作。",
			"rows.target.local": "本机 Computer",
			"rows.target.container": "Docker Computer",
			"local.title": "本机 Computer",
			"local.granted": "桌面权限已授予",
			"local.description": "直接操作运行 DSH 的 Mac。首次检查会安装桌面操作组件；请在这台电脑上完成登录。",
			"local.check": "检查权限",
			"local.checking": "正在检查…",
			"local.chip.granted": "已授权",
			"local.chip.checking": "检查中",
			"local.chip.unchecked": "未检查",
			"local.chip.failed": "需要处理",
			"entry.label": "电脑",
			"entry.screen.title": "{name} 的屏幕",
			"entry.shared": "这台电脑由本 profile 的所有 PersonaBot 共享：各自拥有自己的窗口，共享登录态与文件。",
			"entry.access.title": "Computer Access",
			"entry.access.on": "Computer Access 已开启",
			"entry.access.enable": "启用 Computer Access",
			"entry.access.disable": "停用 Computer Access",
			"entry.access.description": "开启后，该 Bot 的会话可以操作这台电脑",
			"entry.access.failed": "切换 Computer Access 失败",
			"entry.access.failureHint": "授权失败",
			"entry.start": "启动",
			"entry.starting": "启动中…",
			"entry.chip.setup": "需要设置",
			"entry.chip.authorize": "待授权",
			"entry.chip.running": "运行中",
			"entry.chip.stopped": "未启动",
			"entry.chip.failed": "出错",
			"entry.stop": "停止",
			"entry.stopping": "停止中…",
			"entry.reconnect": "重新连接",
			"entry.connecting": "连接中",
			"entry.reconnecting": "正在重新连接",
			"entry.live": "已连接",
			"entry.noScreen": "暂无画面",
			"entry.openFullscreen": "打开大屏",
			"entry.watchOnly": "观看模式 · 开启交互后可操作键盘鼠标",
			"entry.interactive.enable": "开启交互",
			"entry.interactive.disable": "停止交互",
			"entry.collapseFullscreen": "收起全屏",
			"entry.recentLogs": "近期动态",
			"entry.recentLogs.empty": "暂无运行记录",
			"entry.recentLogs.failed": "读取运行记录失败",
			"entry.authorize": "授权并启动",
			"entry.cancel": "取消",
			"entry.remember": "本次会话内不再询问",
			"entry.authorizeIntro": "启动会在你的机器上执行：",
			"entry.authorize.probe": "检测本机容器运行时；缺失时只给安装引导，不会自动安装",
			"entry.authorize.volume": "创建/复用持久卷（登录态与文件保留在这台电脑上）",
			"entry.authorize.pull": "拉取镜像（首次约 1.2 GB 网络流量）并创建容器",
			"entry.authorize.bind": "把 Web VNC 绑定到 127.0.0.1 的本地端口，仅本机可访问",
			"entry.authorize.storage": "存储位置：{target}",
			"entry.authorize.storageBindRisk": "Bind mount 把浏览器 profile（含 SQLite 与缓存）直接落在宿主目录；在 Docker Desktop / Colima 等虚拟文件共享下文件锁不可靠，可能损坏数据，仅建议 Linux 原生 Docker 使用。详见 Docker 文档：https://docs.docker.com/storage/bind-mounts/",
			"entry.phase.pulling": "正在拉取镜像",
			"entry.phase.starting": "正在启动",
			"entry.phase.stopping": "正在停止",
			"entry.phase.exporting": "正在导出",
			"entry.phase.importing": "正在导入",
			"entry.phase.working": "处理中",
			"entry.wait": "请稍候",
			"entry.elapsed": "已用时 {seconds}s",
			"entry.updated": "最后更新 {seconds}s 前",
			"entry.setup": "未检测到容器运行时。任选其一安装后重试：\n\nColima（推荐，MIT）：\n  brew install colima docker\n  brew services start colima\n\n或 Docker Desktop：https://www.docker.com/products/docker-desktop/",
			"section.title": "Computer",
			"section.description": "操作目标与 Computer 权限",
			"rows.exportDir.title": "Computer 导出目录",
			"rows.exportDir.current": "当前：{dir}",
			"rows.exportDir.empty": "未配置时使用默认导出目录",
			"rows.exportDir.pick": "选择…",
			"rows.exportDir.manual": "手动输入路径",
			"rows.exportDir.save": "保存",
			"rows.exportDir.saving": "正在保存…",
			"rows.exportDir.saved": "导出目录已保存：{dir}",
			"rows.exportDir.needsAbsolute": "路径必须是绝对路径，例如 /path/to/exports",
			"rows.exportDir.saveRejected": "Host 未接受该导出目录，已恢复原值；请重试",
			"rows.exportDir.open": "打开目录",
			"rows.idle.title": "空闲停止",
			"rows.idle.description": "无观看者时 Computer 自动停止的等待时间",
			"rows.idle.minutes": "{minutes} 分钟",
			"rows.autoAllow.title": "自动允许 Computer 操作",
			"rows.autoAllow.description": "打开后，PersonaBot 在 Computer 上的操作不再逐会话询问；默认关闭。",
			"rows.exportSection.title": "导出",
			"rows.exportSection.description": "把 Computer 的持久存储打包成一个归档",
			"rows.importSection.title": "导入",
			"rows.importSection.description": "从归档恢复 Computer",
			"rows.export": "导出",
			"rows.exporting": "导出中…",
			"rows.download": "下载",
			"rows.exportTo": "导出到…",
			"rows.authorizeExport": "授权并导出",
			"rows.exportTarget": "导出至：{dir}",
			"rows.import": "导入…",
			"rows.importing": "导入中…",
			"rows.chooseFile": "选择归档文件…",
			"rows.cancelImport": "取消导入",
			"rows.authorizeImportConfirm": "授权并导入",
			"rows.exported": "已导出：{archive}",
			"rows.exportedDone": "导出完成。",
			"rows.imported": "已从 {file} 导入并重启 Computer。",
			"rows.noArchives": "该目录还没有归档；先导出一次。",
			"rows.noSettings": "设置服务不可用：可以导出/导入，但无法修改目录与空闲时间。",
			"rows.pickerFallback": "目录选择器不可用；可手动输入路径，或继续使用当前目录：{dir}"
		};
		const en = {
			"rows.target.title": "Computer Target",
			"rows.target.description": "All Bots in this Profile share one target. Switching requires new action authorization.",
			"rows.target.local": "Local Computer",
			"rows.target.container": "Docker Computer",
			"local.title": "Local Computer",
			"local.granted": "Desktop permissions granted",
			"local.description": "Uses the Mac running DSH. The first check installs the required desktop helper. Complete logins on this computer.",
			"local.check": "Check permissions",
			"local.checking": "Checking…",
			"local.chip.granted": "Granted",
			"local.chip.checking": "Checking",
			"local.chip.unchecked": "Not checked",
			"local.chip.failed": "Needs attention",
			"entry.label": "Computer",
			"entry.screen.title": "{name}'s screen",
			"entry.shared": "This Computer is shared by every PersonaBot in the profile: each keeps its own window and they share logins and files.",
			"entry.access.title": "Computer Access",
			"entry.access.on": "Computer Access is on",
			"entry.access.enable": "Enable Computer Access",
			"entry.access.disable": "Disable Computer Access",
			"entry.access.description": "This PersonaBot's sessions may act on the Computer",
			"entry.access.failed": "Could not change Computer Access",
			"entry.access.failureHint": "Access failed",
			"entry.start": "Start",
			"entry.starting": "Starting…",
			"entry.chip.setup": "Needs setup",
			"entry.chip.authorize": "Needs approval",
			"entry.chip.running": "Running",
			"entry.chip.stopped": "Stopped",
			"entry.chip.failed": "Error",
			"entry.stop": "Stop",
			"entry.stopping": "Stopping…",
			"entry.reconnect": "Reconnect",
			"entry.connecting": "Connecting",
			"entry.reconnecting": "Reconnecting",
			"entry.live": "Connected",
			"entry.noScreen": "No picture",
			"entry.openFullscreen": "Open fullscreen",
			"entry.watchOnly": "Watch-only — enable input to use keyboard and mouse",
			"entry.interactive.enable": "Enable input",
			"entry.interactive.disable": "Stop input",
			"entry.collapseFullscreen": "Leave fullscreen",
			"entry.recentLogs": "Recent activity",
			"entry.recentLogs.empty": "No operational records yet",
			"entry.recentLogs.failed": "Could not load operational records",
			"entry.authorize": "Authorize and start",
			"entry.cancel": "Cancel",
			"entry.remember": "Don't ask again in this session",
			"entry.authorizeIntro": "Starting runs these steps on your machine:",
			"entry.authorize.probe": "Detect the local container runtime; a missing one only gets setup guidance, never an automatic install",
			"entry.authorize.volume": "Create or reuse the persistent volume (logins and files stay on this Computer)",
			"entry.authorize.pull": "Pull the image (about 1.2 GB the first time) and create the container",
			"entry.authorize.bind": "Bind the web VNC endpoint to a loopback port, reachable only from this machine",
			"entry.authorize.storage": "Storage location: {target}",
			"entry.authorize.storageBindRisk": "A bind mount places the browser profile (including SQLite and caches) directly on a host directory; file locking over virtual filesystem sharing (Docker Desktop, Colima, …) is unreliable and can corrupt data — recommended only for native Linux Docker. See the Docker docs: https://docs.docker.com/storage/bind-mounts/",
			"entry.phase.pulling": "Pulling the image",
			"entry.phase.starting": "Starting",
			"entry.phase.stopping": "Stopping",
			"entry.phase.exporting": "Exporting",
			"entry.phase.importing": "Importing",
			"entry.phase.working": "Working",
			"entry.wait": "Please wait",
			"entry.elapsed": "Elapsed {seconds}s",
			"entry.updated": "Last update {seconds}s ago",
			"entry.setup": "No container runtime found. Install one of these, then retry:\n\nColima (recommended, MIT):\n  brew install colima docker\n  brew services start colima\n\nOr Docker Desktop: https://www.docker.com/products/docker-desktop/",
			"section.title": "Computer",
			"section.description": "Computer target and permissions",
			"rows.exportDir.title": "Computer export directory",
			"rows.exportDir.current": "Current: {dir}",
			"rows.exportDir.empty": "Uses the default export directory when none is set",
			"rows.exportDir.pick": "Choose…",
			"rows.exportDir.manual": "Type a path",
			"rows.exportDir.save": "Save",
			"rows.exportDir.saving": "Saving…",
			"rows.exportDir.saved": "Export directory saved: {dir}",
			"rows.exportDir.needsAbsolute": "Path must be absolute, e.g. /path/to/exports",
			"rows.exportDir.saveRejected": "The Host did not accept the export directory — the previous value was restored; try again",
			"rows.exportDir.open": "Open folder",
			"rows.idle.title": "Idle stop",
			"rows.idle.description": "How long the Computer waits without viewers before stopping",
			"rows.idle.minutes": "{minutes} min",
			"rows.autoAllow.title": "Auto-allow Computer actions",
			"rows.autoAllow.description": "When on, PersonaBot actions on the Computer run without a per-session approval; off by default.",
			"rows.exportSection.title": "Export",
			"rows.exportSection.description": "Pack the Computer's persistent store into one archive",
			"rows.importSection.title": "Import",
			"rows.importSection.description": "Restore the Computer from an archive",
			"rows.export": "Export",
			"rows.exporting": "Exporting…",
			"rows.download": "Download",
			"rows.exportTo": "Export to…",
			"rows.authorizeExport": "Authorize and export",
			"rows.exportTarget": "Export to: {dir}",
			"rows.import": "Import…",
			"rows.importing": "Importing…",
			"rows.chooseFile": "Choose archive file…",
			"rows.cancelImport": "Cancel import",
			"rows.authorizeImportConfirm": "Authorize and import",
			"rows.exported": "Exported: {archive}",
			"rows.exportedDone": "Export complete.",
			"rows.imported": "Imported {file} and restarted the Computer.",
			"rows.noArchives": "No archives in that directory yet — export once first.",
			"rows.noSettings": "Settings service unavailable: export and import still work, but the directory and idle time cannot be changed.",
			"rows.pickerFallback": "Directory picker unavailable — type a path or use the current directory: {dir}"
		};
		const PHASE_LABEL = {
			pulling: "entry.phase.pulling",
			starting: "entry.phase.starting",
			stopping: "entry.phase.stopping",
			exporting: "entry.phase.exporting",
			importing: "entry.phase.importing"
		};
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
		//#region packages/client/src/client/sidebar-card.tsx
		function SidebarCardList({ label, className, listRef, children }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
				ref: listRef,
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
		//#region packages/computer/src/settings.ts
		const COMPUTER_SETTINGS_NAMESPACE = "botharness-computer";
		const COMPUTER_EXPORT_DIR_FIELD = "exportDir";
		const COMPUTER_IDLE_STOP_FIELD = "idleStopMinutes";
		const COMPUTER_AUTO_ALLOW_FIELD = "autoAllowActions";
		const COMPUTER_TARGET_FIELD = "target";
		//#endregion
		//#region packages/computer/src/client/mounted-resource.ts
		function useMountedResource(start, dependencies) {
			const cleanup = (0, react.useRef)(void 0);
			return (0, react.useCallback)((node) => {
				cleanup.current?.();
				cleanup.current = void 0;
				if (node !== null) cleanup.current = start(node) || void 0;
			}, dependencies);
		}
		//#endregion
		//#region packages/client/src/client/ds/note.tsx
		const styles = {
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
				...props(styles.note, inset && styles.inset, styles[tone]),
				children
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
		function PillButton({ children, ...rest }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
				type: "button",
				...rest,
				className: "bhx3nfvp2 bhx6s0dn4 bhx12e6dxb bhx193iq5w bhxxevliy bhx1vid4s1 bhxc342km bhx4g09nt bhxw43b1w bhx1lc0nsx bhx24dycr bhxjb2p0i bhx5g6txa bhx3350y7 bhxuxw1ft bhx1ypdohk bhxtgyt42 bhx1hc1fzr bhxijokvz bhx1a2a7pz bhx1m95a6t bhx1y3gkto",
				children
			});
		}
		function PillFileButton({ children, ...input }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
				className: "bhx3nfvp2 bhx6s0dn4 bhx12e6dxb bhx193iq5w bhxxevliy bhx1vid4s1 bhxc342km bhx4g09nt bhxw43b1w bhx1lc0nsx bhx24dycr bhxjb2p0i bhx5g6txa bhx3350y7 bhxuxw1ft bhx1ypdohk bhxtgyt42 bhx1hc1fzr bhxijokvz bhx1a2a7pz bhx1m95a6t bhx1y3gkto",
				children: [children, /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
					...input,
					type: "file",
					hidden: true
				})]
			});
		}
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
		//#region packages/computer/src/client/local-computer.tsx
		function LocalComputerStatus({ t }) {
			const [payload, setPayload] = (0, react.useState)();
			const [busy, setBusy] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)();
			const refresh = (0, react.useCallback)(async (signal) => {
				const response = await fetch("/api/computer/status", {
					credentials: "same-origin",
					...signal === void 0 ? {} : { signal }
				});
				if (!response.ok) throw new Error(`Computer status: HTTP ${String(response.status)}`);
				const next = await response.json();
				if (!signal?.aborted) {
					setPayload(next);
					setError(void 0);
				}
			}, []);
			const resource = useMountedResource(() => {
				const controller = new AbortController();
				let pending = false;
				const poll = async () => {
					if (pending || controller.signal.aborted) return;
					pending = true;
					try {
						await refresh(AbortSignal.any([controller.signal, AbortSignal.timeout(1e4)]));
					} catch (error) {
						if (!controller.signal.aborted) setError(String(error));
					} finally {
						pending = false;
					}
				};
				poll();
				const timer = setInterval(() => void poll(), 2e3);
				return () => {
					controller.abort();
					clearInterval(timer);
				};
			}, [refresh]);
			const preparing = busy || payload?.status?.phase === "starting";
			const failure = error ?? payload?.status?.detail ?? payload?.probe?.detail;
			const check = () => {
				setBusy(true);
				setError(void 0);
				fetch("/api/computer/start", {
					method: "POST",
					credentials: "same-origin",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						authorize: true,
						target: "local"
					})
				}).then(async (response) => {
					if (!response.ok) throw new Error(await response.text());
					await refresh();
				}).catch((error) => setError(String(error))).finally(() => setBusy(false));
			};
			const granted = payload?.status?.state === "running";
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				ref: resource,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SidebarCardList, {
					className: "bh-computer-cards",
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SidebarCardRow, {
						icon: "monitor",
						title: t("local.title"),
						chips: granted ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tag, {
							tone: "success",
							children: t("local.chip.granted")
						}) : preparing ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tag, {
							tone: "info",
							children: t("local.chip.checking")
						}) : failure === void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tag, {
							tone: "neutral",
							children: t("local.chip.unchecked")
						}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tag, {
							tone: "danger",
							children: t("local.chip.failed")
						}),
						meta: t(granted ? "local.granted" : "local.description"),
						detail: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "bhxrvj5dj bhx2zm2ee bhx619ttb",
							children: [failure === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Note, {
								tone: "danger",
								children: failure
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								size: "sm",
								variant: "outline",
								disabled: preparing || payload?.probe?.available === false,
								onClick: check,
								children: t(preparing ? "local.checking" : "local.check")
							})]
						})
					})
				})
			});
		}
		//#endregion
		//#region packages/computer/src/client/settings-rows.tsx
		var ExportDirRejectedError = class extends Error {
			constructor() {
				super("the Host did not accept the export directory");
				this.name = "ExportDirRejectedError";
			}
		};
		function displayExportDir(configured, hostDir) {
			return configured !== "" ? configured : hostDir ?? "";
		}
		var ComputerSettingsPrefs = class {
			snapshot = {
				target: "container",
				exportDir: "",
				idleStopMinutes: 30,
				autoAllowActions: false,
				status: "loading",
				writable: false
			};
			listeners = /* @__PURE__ */ new Set();
			scope;
			detach;
			attach(scope) {
				this.detach?.();
				this.scope = scope;
				this.detach = scope.subscribe(() => {
					this.sync();
				});
				this.sync();
				return () => {
					this.detach?.();
					this.detach = void 0;
					this.scope = void 0;
				};
			}
			getSnapshot = () => this.snapshot;
			subscribe = (listener) => {
				this.listeners.add(listener);
				return () => {
					this.listeners.delete(listener);
				};
			};
			async setTarget(target) {
				if (this.scope === void 0) throw new Error("Computer settings are unavailable");
				await this.scope.set(COMPUTER_TARGET_FIELD, target);
				this.sync();
				if (this.snapshot.target !== target) throw new Error("Computer Target was not saved");
			}
			async setExportDir(exportDir) {
				if (this.scope === void 0) throw new ExportDirRejectedError();
				this.publish({ exportDir });
				try {
					await this.scope.set(COMPUTER_EXPORT_DIR_FIELD, exportDir);
				} catch (error) {
					this.sync();
					throw error;
				}
				if (this.snapshot.exportDir !== exportDir) throw new ExportDirRejectedError();
			}
			setIdleStopMinutes(idleStopMinutes) {
				this.publish({ idleStopMinutes });
				this.scope?.set(COMPUTER_IDLE_STOP_FIELD, idleStopMinutes).catch(() => void 0);
			}
			setAutoAllowActions(autoAllowActions) {
				const previous = this.snapshot.autoAllowActions;
				this.publish({ autoAllowActions });
				this.scope?.set(COMPUTER_AUTO_ALLOW_FIELD, autoAllowActions).catch(() => {
					this.publish({ autoAllowActions: previous });
				});
			}
			publish(patch) {
				this.snapshot = {
					...this.snapshot,
					...patch
				};
				for (const listener of this.listeners) listener();
			}
			sync() {
				const scope = this.scope;
				if (scope === void 0) return;
				const next = scope.getSnapshot();
				const value = next.value;
				this.snapshot = {
					target: value?.target ?? "container",
					exportDir: value?.exportDir ?? "",
					idleStopMinutes: value?.idleStopMinutes ?? 30,
					autoAllowActions: value?.autoAllowActions ?? false,
					status: next.status,
					writable: next.writable
				};
				for (const listener of this.listeners) listener();
			}
		};
		const IDLE_OPTIONS = [
			15,
			30,
			60,
			120,
			240
		];
		const EXPORT_ENDPOINT = "/api/computer/export";
		const IMPORT_ENDPOINT = "/api/computer/import";
		const EXPORTS_ENDPOINT = "/api/computer/exports";
		const STATUS_ENDPOINT$1 = "/api/computer/status";
		const OPEN_DIR_ENDPOINT = "/api/computer/open-dir";
		const DOWNLOAD_ENDPOINT = "/api/computer/download";
		const UPLOAD_ENDPOINT = "/api/computer/upload";
		const UPLOAD_CONTENT_ENDPOINT = "/api/computer/upload-content";
		async function requestJson$1(url, init) {
			const response = await fetch(url, {
				credentials: "same-origin",
				...init
			});
			if (!response.ok) throw new Error(`${String(response.status)} ${await response.text()}`);
			return await response.json();
		}
		async function postAuthorized(url, body = {}) {
			await requestJson$1(url, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					authorize: true,
					...body
				})
			});
		}
		function createComputerSettingsFace(options) {
			const { prefs } = options;
			return {
				prefs,
				pickerAvailable: options.pickDirectory !== void 0,
				pickDirectory: async () => options.pickDirectory === void 0 ? null : options.pickDirectory(),
				openDirectory: async (dir) => {
					await postAuthorized(OPEN_DIR_ENDPOINT, dir === "" ? {} : { dir });
				},
				exportArchive: async (dir) => {
					if (dir !== void 0 && dir !== "") await prefs.setExportDir(dir);
					const payload = await requestJson$1(EXPORT_ENDPOINT, {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify(dir === void 0 || dir === "" ? { authorize: true } : {
							authorize: true,
							dir
						})
					});
					return {
						archive: payload.archive ?? "",
						...payload.downloadToken === void 0 ? {} : { downloadToken: payload.downloadToken }
					};
				},
				downloadUrl: (downloadToken) => `${DOWNLOAD_ENDPOINT}?token=${encodeURIComponent(downloadToken)}`,
				importArchive: async (file) => {
					await postAuthorized(IMPORT_ENDPOINT, { file });
				},
				requestUpload: async (file) => {
					const payload = await requestJson$1(UPLOAD_ENDPOINT, {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({
							authorize: true,
							file
						})
					});
					if (payload.uploadToken === void 0) throw new Error("upload not accepted");
					return payload.uploadToken;
				},
				sendUploadBytes: (uploadToken, file) => new Promise((resolve, reject) => {
					const xhr = (options.createXhr ?? (() => new XMLHttpRequest()))();
					xhr.open("POST", `${UPLOAD_CONTENT_ENDPOINT}?token=${encodeURIComponent(uploadToken)}`);
					xhr.withCredentials = true;
					xhr.setRequestHeader("content-type", "application/octet-stream");
					xhr.onload = () => {
						if (xhr.status !== 200) {
							reject(/* @__PURE__ */ new Error(`upload failed: HTTP ${String(xhr.status)}`));
							return;
						}
						try {
							const payload = JSON.parse(xhr.responseText);
							if (payload.ok === true) resolve();
							else reject(new Error(typeof payload.error === "string" ? payload.error : "upload failed"));
						} catch (error) {
							reject(error instanceof Error ? error : new Error(String(error)));
						}
					};
					xhr.onerror = () => reject(/* @__PURE__ */ new Error("upload transport failed"));
					xhr.send(file);
				}),
				listArchives: async () => {
					return (await requestJson$1(EXPORTS_ENDPOINT)).files ?? [];
				},
				hostExportDir: async () => {
					return (await requestJson$1(STATUS_ENDPOINT$1)).exportDir ?? "";
				}
			};
		}
		function Selector({ label, open, onToggle, disabled }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(PillButton, {
				"aria-haspopup": "menu",
				"aria-expanded": open,
				disabled: disabled === true,
				onClick: onToggle,
				children: [label, /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: "bhx3nfvp2 bhx2lah0s bhxr3raxm",
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronDownOutlineRegular, { size: 12 })
				})]
			});
		}
		function ComputerSettingsRows({ t, prefs, pickerAvailable, pickDirectory, openDirectory, exportArchive, downloadUrl, importArchive, requestUpload, sendUploadBytes, listArchives, hostExportDir }) {
			const snapshot = (0, react.useSyncExternalStore)(prefs.subscribe, prefs.getSnapshot);
			const [targetError, setTargetError] = (0, react.useState)();
			const [targetSaving, setTargetSaving] = (0, react.useState)(false);
			const [idleOpen, setIdleOpen] = (0, react.useState)(false);
			const [importOpen, setImportOpen] = (0, react.useState)(false);
			const [archives, setArchives] = (0, react.useState)(void 0);
			const [busy, setBusy] = (0, react.useState)(void 0);
			const [confirming, setConfirming] = (0, react.useState)(void 0);
			const [exportTarget, setExportTarget] = (0, react.useState)(void 0);
			const [manualOpen, setManualOpen] = (0, react.useState)(false);
			const [manualPath, setManualPath] = (0, react.useState)("");
			const [saving, setSaving] = (0, react.useState)(false);
			const [dirNote, setDirNote] = (0, react.useState)(void 0);
			const [transferNote, setTransferNote] = (0, react.useState)(void 0);
			const [download, setDownload] = (0, react.useState)(void 0);
			const [uploadName, setUploadName] = (0, react.useState)(void 0);
			const uploadFile = (0, react.useRef)(null);
			const [pickerBroken, setPickerBroken] = (0, react.useState)(false);
			const [hostDir, setHostDir] = (0, react.useState)(void 0);
			const [livePhase, setLivePhase] = (0, react.useState)(void 0);
			const [liveElapsed, setLiveElapsed] = (0, react.useState)(0);
			const hostDirResource = useMountedResource(() => {
				if (snapshot.target === "local") return;
				if (snapshot.status !== "unavailable" && snapshot.exportDir !== "") return;
				let active = true;
				hostExportDir().then((dir) => {
					if (active) setHostDir(dir);
				}).catch(() => void 0);
				return () => {
					active = false;
				};
			}, [
				hostExportDir,
				snapshot.status,
				snapshot.exportDir,
				snapshot.target
			]);
			const busyResource = useMountedResource(() => {
				setLivePhase(void 0);
				setLiveElapsed(0);
				const startedAt = Date.now();
				const controller = new AbortController();
				let pending = false;
				const tick = async () => {
					if (controller.signal.aborted) return;
					setLiveElapsed(Math.round((Date.now() - startedAt) / 1e3));
					if (pending) return;
					pending = true;
					try {
						const payload = await requestJson$1(STATUS_ENDPOINT$1, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(1e4)]) });
						if (!controller.signal.aborted) setLivePhase(payload.status?.phase);
					} catch {} finally {
						pending = false;
					}
				};
				tick();
				const timer = setInterval(() => void tick(), 1e3);
				return () => {
					controller.abort();
					clearInterval(timer);
				};
			}, [busy]);
			const phaseKey = livePhase === void 0 ? void 0 : PHASE_LABEL[livePhase];
			const exportDir = displayExportDir(snapshot.exportDir, hostDir);
			const hasDir = exportDir !== "";
			const writable = snapshot.status === "ready" && snapshot.writable;
			const canAdjust = pickerAvailable && !pickerBroken;
			const pickDirectoryInto = (0, react.useCallback)((apply) => {
				pickDirectory().then((dir) => {
					if (dir !== null) apply(dir);
				}).catch(() => {
					setPickerBroken(true);
					setManualOpen(false);
					setDirNote(t("rows.pickerFallback", { dir: exportDir }));
				});
			}, [
				exportDir,
				pickDirectory,
				t
			]);
			const pickExportDir = (0, react.useCallback)(() => {
				pickDirectoryInto((dir) => {
					setManualPath(dir);
					setDirNote(void 0);
					prefs.setExportDir(dir).catch((error) => setDirNote(String(error)));
				});
			}, [pickDirectoryInto, prefs]);
			const startExport = (0, react.useCallback)(() => {
				if (!canAdjust) {
					setExportTarget(void 0);
					setConfirming("export");
					return;
				}
				pickDirectory().then((dir) => {
					if (dir === null) return;
					setExportTarget(dir);
					setConfirming("export");
				}).catch(() => {
					setPickerBroken(true);
					setManualOpen(false);
					setDirNote(t("rows.pickerFallback", { dir: exportDir }));
					setExportTarget(void 0);
					setConfirming("export");
				});
			}, [
				canAdjust,
				exportDir,
				pickDirectory,
				t
			]);
			const saveManualPath = (0, react.useCallback)(() => {
				const dir = manualPath.trim();
				if (dir === "") return;
				if (!dir.startsWith("/") && !/^[A-Za-z]:[\\/]/u.test(dir)) {
					setDirNote(t("rows.exportDir.needsAbsolute"));
					return;
				}
				setSaving(true);
				setDirNote(void 0);
				prefs.setExportDir(dir).then(() => {
					setManualOpen(false);
					setDirNote(t("rows.exportDir.saved", { dir }));
				}).catch((error) => setDirNote(error instanceof ExportDirRejectedError ? t("rows.exportDir.saveRejected") : String(error))).finally(() => setSaving(false));
			}, [
				manualPath,
				prefs,
				t
			]);
			const runExport = (0, react.useCallback)(() => {
				const autoOpen = !canAdjust;
				setConfirming(void 0);
				setBusy("export");
				setTransferNote(void 0);
				setDownload(void 0);
				exportArchive(exportTarget).then(({ archive, downloadToken }) => {
					setTransferNote(archive === "" ? t("rows.exportedDone") : t("rows.exported", { archive }));
					if (archive !== "" && downloadToken !== void 0) setDownload({
						archive,
						token: downloadToken
					});
					if (autoOpen) openDirectory(exportDir).catch(() => void 0);
				}).catch((error) => setTransferNote(String(error))).finally(() => setBusy(void 0));
			}, [
				canAdjust,
				exportArchive,
				exportDir,
				exportTarget,
				openDirectory,
				t
			]);
			const runImport = (0, react.useCallback)((file) => {
				setImportOpen(false);
				setConfirming(void 0);
				setBusy("import");
				setTransferNote(void 0);
				importArchive(file).then(() => setTransferNote(t("rows.imported", { file }))).catch((error) => setTransferNote(String(error))).finally(() => setBusy(void 0));
			}, [importArchive, t]);
			const takeUploadFile = (0, react.useCallback)((file) => {
				if (file === null) return;
				uploadFile.current = file;
				setUploadName(file.name);
				setTransferNote(void 0);
			}, []);
			const runUpload = (0, react.useCallback)(() => {
				const file = uploadFile.current;
				const name = uploadName;
				if (file === null || name === void 0) return;
				setConfirming(void 0);
				setBusy("upload");
				setTransferNote(void 0);
				requestUpload(name).then((token) => sendUploadBytes(token, file)).then(() => importArchive(name)).then(() => {
					setTransferNote(t("rows.imported", { file: name }));
					setUploadName(void 0);
					uploadFile.current = null;
				}).catch((error) => setTransferNote(String(error))).finally(() => setBusy(void 0));
			}, [
				uploadName,
				requestUpload,
				sendUploadBytes,
				importArchive,
				t
			]);
			const openImport = (0, react.useCallback)(() => {
				if (importOpen) {
					setImportOpen(false);
					return;
				}
				listArchives().then((files) => {
					setArchives(files);
					if (files.length === 0) {
						setImportOpen(false);
						setTransferNote(t("rows.noArchives"));
					} else setImportOpen(true);
				}).catch((error) => setTransferNote(String(error)));
			}, [
				importOpen,
				listArchives,
				t
			]);
			const openDir = (0, react.useCallback)(() => {
				openDirectory(exportDir).catch((error) => setDirNote(String(error)));
			}, [exportDir, openDirectory]);
			const selectedFile = uploadName ?? (confirming === "import" ? archives?.[0] : void 0);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(SettingsRows, { children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					hidden: true,
					ref: hostDirResource
				}),
				busy === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					hidden: true,
					ref: busyResource
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: "bhx1ghz6dp bhxb590mu bhx1e1oj2y bhxr3raxm bhxgowt09 bhx12cu2lo",
					children: t("section.description")
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SettingsRow, {
					title: t("rows.target.title"),
					description: t("rows.target.description"),
					control: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Select, {
						label: t("rows.target.title"),
						value: snapshot.target,
						options: ["local", "container"].map((id) => ({
							value: id,
							label: t(`rows.target.${id}`)
						})),
						disabled: !writable || targetSaving,
						onChange: (id) => {
							setTargetSaving(true);
							setTargetError(void 0);
							prefs.setTarget(id).catch((error) => setTargetError(String(error))).finally(() => setTargetSaving(false));
						}
					})
				}),
				targetError === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Note, {
					tone: "danger",
					children: targetError
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SettingsRow, {
					title: t("rows.autoAllow.title"),
					description: t("rows.autoAllow.description"),
					control: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Switch, {
						checked: snapshot.autoAllowActions,
						disabled: !writable,
						onChange: (next) => {
							prefs.setAutoAllowActions(next);
						},
						label: t("rows.autoAllow.title")
					})
				}),
				snapshot.target === "local" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(LocalComputerStatus, { t }) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SettingsRow, {
						title: t("rows.exportDir.title"),
						description: hasDir ? t("rows.exportDir.current", { dir: exportDir }) : t("rows.exportDir.empty"),
						control: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
							canAdjust ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(PillButton, {
								disabled: !writable,
								onClick: pickExportDir,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconFolderOpenOutlineRegular, { size: 14 }), t("rows.exportDir.pick")]
							}) : null,
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(PillButton, {
								disabled: !hasDir,
								onClick: openDir,
								children: t("rows.exportDir.open")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(PillButton, {
								disabled: !writable,
								onClick: () => {
									setManualOpen((value) => !value);
									setManualPath(exportDir);
								},
								children: t("rows.exportDir.manual")
							})
						] })
					}),
					manualOpen ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "bhx78zum5 bhx6s0dn4 bhx1mckxr8 bhxeuugli bhxe74ayl bhxrvphhj bhx1q0q8m5 bhxnoyelg",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
							className: { className: "bhx1iyjqo2 bhxs83m0k bhx1r8uery bhxeuugli" }.className ?? "",
							value: manualPath,
							placeholder: "/absolute/path",
							"aria-label": t("rows.exportDir.manual"),
							onChange: (event) => {
								setManualPath(event.target.value);
							}
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(PillButton, {
							disabled: !writable || saving || manualPath.trim() === "",
							onClick: saveManualPath,
							children: saving ? t("rows.exportDir.saving") : t("rows.exportDir.save")
						})]
					}) : null,
					dirNote === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Note, { children: dirNote }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SettingsRow, {
						title: t("rows.idle.title"),
						description: t("rows.idle.description"),
						control: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Menu, {
							open: idleOpen,
							portal: true,
							align: "end",
							items: IDLE_OPTIONS.map((minutes) => ({
								id: String(minutes),
								label: t("rows.idle.minutes", { minutes })
							})),
							selectedId: String(snapshot.idleStopMinutes),
							onSelect: (id) => {
								setIdleOpen(false);
								prefs.setIdleStopMinutes(Number(id));
							},
							onClose: () => {
								setIdleOpen(false);
							},
							anchor: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Selector, {
								label: t("rows.idle.minutes", { minutes: snapshot.idleStopMinutes }),
								open: idleOpen,
								disabled: !writable,
								onToggle: () => {
									setIdleOpen((value) => !value);
								}
							})
						})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SettingsRow, {
						title: t("rows.exportSection.title"),
						description: t("rows.exportSection.description"),
						control: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [confirming === "export" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(PillButton, {
							onClick: () => {
								setConfirming(void 0);
							},
							children: t("entry.cancel")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(PillButton, {
							onClick: runExport,
							children: t("rows.authorizeExport")
						})] }) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(PillButton, {
							disabled: !hasDir && !canAdjust || busy !== void 0,
							onClick: startExport,
							children: busy === "export" ? t("rows.exporting") : canAdjust ? t("rows.exportTo") : t("rows.export")
						}), download === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(PillButton, {
							onClick: () => {
								globalThis.location?.assign(downloadUrl(download.token));
							},
							children: t("rows.download")
						})] })
					}),
					confirming === "export" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Note, { children: t("rows.exportTarget", { dir: exportTarget ?? exportDir }) }) : null,
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SettingsRow, {
						title: t("rows.importSection.title"),
						description: t("rows.importSection.description"),
						control: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
							uploadName !== void 0 ? null : confirming === "import" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(PillButton, {
								onClick: () => {
									setConfirming(void 0);
								},
								children: t("rows.cancelImport")
							}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Menu, {
								open: importOpen,
								portal: true,
								align: "end",
								items: (archives ?? []).map((file) => ({
									id: file,
									label: file
								})),
								onSelect: (id) => {
									setConfirming("import");
									setArchives([id]);
								},
								onClose: () => {
									setImportOpen(false);
								},
								anchor: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Selector, {
									label: busy === "import" ? t("rows.importing") : t("rows.import"),
									open: importOpen,
									disabled: !hasDir || busy !== void 0,
									onToggle: openImport
								})
							}),
							uploadName === void 0 && confirming === "import" && archives?.[0] !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(PillButton, {
								disabled: busy !== void 0,
								onClick: () => {
									const file = archives[0];
									if (file !== void 0) runImport(file);
								},
								children: t("rows.authorizeImportConfirm")
							}) : null,
							uploadName !== void 0 || confirming === "import" ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(PillFileButton, {
								accept: ".tar,application/x-tar",
								disabled: busy !== void 0,
								onChange: (event) => {
									const file = event.target.files?.[0] ?? null;
									event.target.value = "";
									takeUploadFile(file);
								},
								children: t("rows.chooseFile")
							}),
							uploadName === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(PillButton, {
								onClick: () => {
									setUploadName(void 0);
									uploadFile.current = null;
								},
								children: t("entry.cancel")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(PillButton, {
								disabled: busy !== void 0,
								onClick: runUpload,
								children: busy === "upload" ? t("rows.importing") : t("rows.authorizeImportConfirm")
							})] })
						] })
					}),
					selectedFile === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "bhx1ghz6dp bhxb3r6kr bhxlyipyv bhxuxw1ft bhxr3raxm bhxgowt09 bhx12cu2lo",
						children: selectedFile
					}),
					busy !== void 0 && phaseKey !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Note, { children: `${t(phaseKey)} · ${t("entry.elapsed", { seconds: liveElapsed })}` }) : null
				] }),
				snapshot.status === "unavailable" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Note, { children: t("rows.noSettings") }) : null,
				snapshot.target !== "container" || transferNote === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Note, { children: transferNote })
			] });
		}
		//#endregion
		//#region packages/computer/src/client/access-power-icon.tsx
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
		//#region packages/client/src/client/ds/stylex-css.ts
		const STYLEX_CSS = "\n.bhx-level-0{}\n.bhx-level-1:not(#\\#){}\n.bhx1ghz6dp:not(#\\#){margin:0}\n.bhx-level-2:not(#\\#):not(#\\#){}\n.bhx4g09nt:not(#\\#):not(#\\#){border-radius:var(--dsw-radius-sm, 8px)}\n.bhxc342km:not(#\\#):not(#\\#){border-width:0}\n.bhx1mckxr8:not(#\\#):not(#\\#){gap:12px}\n.bhx5v8n67:not(#\\#):not(#\\#){gap:2px}\n.bhx12e6dxb:not(#\\#):not(#\\#){gap:4px}\n.bhx2zm2ee:not(#\\#):not(#\\#){gap:8px}\n.bhx1a2a7pz:not(#\\#):not(#\\#){outline:none}\n.bhxb3r6kr:not(#\\#):not(#\\#){overflow:hidden}\n.bhxe74ayl:not(#\\#):not(#\\#){padding-block:12px}\n.bhx89kiln:not(#\\#):not(#\\#){padding-block:4px}\n.bhx1vid4s1:not(#\\#):not(#\\#){padding-inline:12px 8px}\n.bhx1w8vjyx:not(#\\#):not(#\\#){padding-inline:4px}\n.bhx1m95a6t:focus-visible:not(#\\#):not(#\\#){outline:var(--dsw-focus-ring-width, 2px) solid var(--dsw-alias-state-business-primary)}\n@media (max-width: 648px){.bhxv0lzym.bhxv0lzym:not(#\\#):not(#\\#){gap:8px}}\n.bhx-level-3:not(#\\#):not(#\\#):not(#\\#){}\n.bhx6s0dn4:not(#\\#):not(#\\#):not(#\\#){align-items:center}\n.bhxw43b1w:not(#\\#):not(#\\#):not(#\\#){background-color:var(--dsw-alias-bg-module-platform)}\n.bhx24dycr:not(#\\#):not(#\\#):not(#\\#){color:var(--dsw-alias-label-primary)}\n.bhxr3raxm:not(#\\#):not(#\\#):not(#\\#){color:var(--dsw-alias-label-secondary)}\n.bhxwq55zj:not(#\\#):not(#\\#):not(#\\#){color:var(--dsw-alias-label-tertiary)}\n.bhx8ay0r6:not(#\\#):not(#\\#):not(#\\#){color:var(--dsw-alias-state-error-primary)}\n.bhx1pideu2:not(#\\#):not(#\\#):not(#\\#){color:var(--dsw-alias-state-success-primary)}\n.bhxz9v26x:not(#\\#):not(#\\#):not(#\\#){color:var(--dsw-alias-state-warn-primary)}\n.bhx1ypdohk:not(#\\#):not(#\\#):not(#\\#){cursor:pointer}\n.bhx78zum5:not(#\\#):not(#\\#):not(#\\#){display:flex}\n.bhxrvj5dj:not(#\\#):not(#\\#):not(#\\#){display:grid}\n.bhx3nfvp2:not(#\\#):not(#\\#):not(#\\#){display:inline-flex}\n.bhx1r8uery:not(#\\#):not(#\\#):not(#\\#){flex-basis:0}\n.bhxdt5ytf:not(#\\#):not(#\\#):not(#\\#){flex-direction:column}\n.bhx1q0g3np:not(#\\#):not(#\\#):not(#\\#){flex-direction:row}\n.bhx1iyjqo2:not(#\\#):not(#\\#):not(#\\#){flex-grow:1}\n.bhx2lah0s:not(#\\#):not(#\\#):not(#\\#){flex-shrink:0}\n.bhxs83m0k:not(#\\#):not(#\\#):not(#\\#){flex-shrink:1}\n.bhx1a02dak:not(#\\#):not(#\\#):not(#\\#){flex-wrap:wrap}\n.bhxjb2p0i:not(#\\#):not(#\\#):not(#\\#){font-family:inherit}\n.bhxgowt09:not(#\\#):not(#\\#):not(#\\#){font-size:12px}\n.bhx5g6txa:not(#\\#):not(#\\#):not(#\\#){font-size:13px}\n.bhxskcadq:not(#\\#):not(#\\#):not(#\\#){font-size:14px}\n.bhx1nj67n:not(#\\#):not(#\\#):not(#\\#){font-weight:500}\n.bhx13a6bvl:not(#\\#):not(#\\#):not(#\\#){justify-content:flex-end}\n.bhx619ttb:not(#\\#):not(#\\#):not(#\\#){justify-items:start}\n.bhx12cu2lo:not(#\\#):not(#\\#):not(#\\#){line-height:16px}\n.bhx1gy5ux2:not(#\\#):not(#\\#):not(#\\#){line-height:20px}\n.bhx3350y7:not(#\\#):not(#\\#):not(#\\#){line-height:20px}\n.bhx1hc1fzr:not(#\\#):not(#\\#):not(#\\#){opacity:1}\n.bhx1y3gkto:not(#\\#):not(#\\#):not(#\\#){outline-offset:1px}\n.bhxj0a0fe:not(#\\#):not(#\\#):not(#\\#){overflow-wrap:anywhere}\n.bhxp4054r:not(#\\#):not(#\\#):not(#\\#){text-align:end}\n.bhxlyipyv:not(#\\#):not(#\\#):not(#\\#){text-overflow:ellipsis}\n.bhxuxw1ft:not(#\\#):not(#\\#):not(#\\#){white-space:nowrap}\n.bhxtgyt42:disabled:not(#\\#):not(#\\#):not(#\\#){cursor:default}\n.bhxijokvz:disabled:not(#\\#):not(#\\#):not(#\\#){opacity:.5}\n.bhx1lc0nsx:hover:not(#\\#):not(#\\#):not(#\\#){background-color:var(--dsw-alias-interactive-bg-hover)}\n@media (max-width: 648px){.bhx15bqsqq.bhx15bqsqq:not(#\\#):not(#\\#):not(#\\#){align-items:stretch}}\n@media (max-width: 648px){.bhx1uptv2i.bhx1uptv2i:not(#\\#):not(#\\#):not(#\\#){flex-direction:column}}\n@media (max-width: 648px){.bhx3xz8fp.bhx3xz8fp:not(#\\#):not(#\\#):not(#\\#){justify-content:flex-start}}\n.bhx-level-4:not(#\\#):not(#\\#):not(#\\#):not(#\\#){}\n.bhxnoyelg:not(#\\#):not(#\\#):not(#\\#):not(#\\#){border-bottom-color:var(--dsw-alias-border-l1)}\n.bhx1q0q8m5:not(#\\#):not(#\\#):not(#\\#):not(#\\#){border-bottom-style:solid}\n.bhxrvphhj:not(#\\#):not(#\\#):not(#\\#):not(#\\#){border-bottom-width:1px}\n.bhxxevliy:not(#\\#):not(#\\#):not(#\\#):not(#\\#){height:28px}\n.bhx193iq5w:not(#\\#):not(#\\#):not(#\\#):not(#\\#){max-width:100%}\n.bhxh9uqaf:not(#\\#):not(#\\#):not(#\\#):not(#\\#){max-width:60%}\n.bhxeuugli:not(#\\#):not(#\\#):not(#\\#):not(#\\#){min-width:0}\n.bhx1e1oj2y:not(#\\#):not(#\\#):not(#\\#):not(#\\#){padding-bottom:4px}\n.bhxb590mu:not(#\\#):not(#\\#):not(#\\#):not(#\\#){padding-top:16px}\n.bhx10zg81t:first-child:not(#\\#):not(#\\#):not(#\\#):not(#\\#){padding-top:0}\n.bhx1bta2m4:last-child:not(#\\#):not(#\\#):not(#\\#):not(#\\#){border-bottom-color:transparent}\n@media (max-width: 648px){.bhx1cnm762.bhx1cnm762:not(#\\#):not(#\\#):not(#\\#):not(#\\#){max-width:100%}}\n";
		//#endregion
		//#region packages/computer/src/client/index.tsx
		const ACCESS_STYLE = `
.bh-computer-access-control { position: relative; display: flex; align-items: center; }
.bh-computer-access-power {
  display: flex; align-items: center; justify-content: center; width: 28px; height: 28px;
  padding: 0; border: 0; border-radius: ${radius.md}; background: transparent;
  color: ${color.muted}; cursor: pointer;
}
.bh-computer-access-power:hover { background: ${color.hover}; }
.bh-computer-access-power[aria-pressed='true'] { color: ${color.accent}; background: ${color.hover}; }
.bh-computer-access-power:focus-visible { outline: ${border.focus} solid ${color.accent}; outline-offset: 2px; }
.bh-computer-access-power:disabled { opacity: 0.5; cursor: default; }
.bh-computer-access-power.bh-access-failed { color: ${color.danger}; }
.bh-computer-access-error { order: -1; padding: 0 ${space.x2}; color: ${color.danger}; font-size: ${text.metaSize}; line-height: ${text.metaLine}; white-space: nowrap; }

`;
		const name = "botharness-computer-client";
		const inject = [
			"slots",
			"channelSidebar",
			"connection",
			"locale"
		];
		const STATUS_ENDPOINT = "/api/computer/status";
		const START_ENDPOINT = "/api/computer/start";
		const STOP_ENDPOINT = "/api/computer/stop";
		const VIEWER_SRC = "/botharness-computer/viewer/";
		const APPROVED_KEY = "botharness-computer-start-approved";
		const ENTRY_ID = "botharness-computer";
		let connectionRpc;
		async function requestJson(url, init) {
			const response = await fetch(url, {
				credentials: "same-origin",
				...init
			});
			if (!response.ok) throw new Error(`${String(response.status)} ${await response.text()}`);
			return await response.json();
		}
		const SETUP_GUIDANCE_KEY = "entry.setup";
		const SHARED_NOTE_KEY = "entry.shared";
		const AUTHORIZATION_POINTS = [
			"entry.authorize.probe",
			"entry.authorize.volume",
			"entry.authorize.pull",
			"entry.authorize.bind"
		];
		const noteStyle = {
			opacity: .7,
			fontSize: 12,
			whiteSpace: "pre-wrap"
		};
		const buttonStyle = {
			padding: "4px 10px",
			borderRadius: 6,
			border: `1px solid ${BH.borderL3}`,
			background: "transparent",
			color: "inherit",
			cursor: "pointer",
			fontSize: 12
		};
		const terminalStyle = {
			fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
			fontSize: 11,
			opacity: .7,
			whiteSpace: "pre-wrap",
			wordBreak: "break-all"
		};
		const DESIGN_WIDTH = 1280;
		const DESIGN_HEIGHT = 800;
		function designOf(resolution) {
			const match = /^(\d{2,5})x(\d{2,5})$/u.exec(resolution ?? "");
			if (match === null) return {
				width: DESIGN_WIDTH,
				height: DESIGN_HEIGHT
			};
			return {
				width: Number(match[1]),
				height: Number(match[2])
			};
		}
		function RecentLogsList({ entries }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				style: terminalStyle,
				children: entries.map((entry) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [
					new Date(entry.ts).toLocaleTimeString(),
					" [",
					entry.kind,
					"] ",
					entry.detail
				] }, entry.id))
			});
		}
		function RecentLogs({ t }) {
			const [open, setOpen] = (0, react.useState)(false);
			const [entries, setEntries] = (0, react.useState)(void 0);
			const [failed, setFailed] = (0, react.useState)(false);
			const loadResource = useMountedResource(() => {
				const controller = new AbortController();
				requestJson("/api/computer/logs?limit=10", { signal: controller.signal }).then((result) => {
					if (!controller.signal.aborted) setEntries(result.entries);
				}).catch(() => {
					if (!controller.signal.aborted) setFailed(true);
				});
				return () => controller.abort();
			}, []);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [
				open && entries === void 0 && !failed ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					hidden: true,
					ref: loadResource
				}) : null,
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					onClick: () => setOpen(!open),
					style: buttonStyle,
					children: t("entry.recentLogs")
				}),
				open ? failed ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					style: noteStyle,
					children: t("entry.recentLogs.failed")
				}) : entries === void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					style: noteStyle,
					children: "…"
				}) : entries.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					style: noteStyle,
					children: t("entry.recentLogs.empty")
				}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(RecentLogsList, { entries }) : null
			] });
		}
		function RunningCard({ t, botSlug, busy, stopping, resolution, onStop }) {
			const onEvent = (0, react.useCallback)((event) => {
				reportViewerEvent(void 0, viewerEventText(event));
			}, []);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(RemoteViewer, {
				t,
				title: t("entry.screen.title", { name: botSlug ?? "PersonaBot" }),
				src: VIEWER_SRC,
				design: designOf(resolution),
				busy,
				stopping,
				onStop,
				footer: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(RecentLogs, { t }),
				onEvent
			});
		}
		function ComputerEntryView(props) {
			const { t, state, phase, detail, progress, runtimeAvailable, confirming, busy, elapsed, nowTs, error, botSlug, storage, resolution, onStart, onConfirmStart, onStop, onApprove, onCancel } = props;
			const title = t("rows.target.container");
			const card = (chip, rest) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SidebarCardList, {
				className: "bh-computer-cards",
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SidebarCardRow, {
					icon: "monitor",
					title,
					chips: chip,
					...rest
				})
			});
			if (!runtimeAvailable) return card(/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tag, {
				tone: "warning",
				children: t("entry.chip.setup")
			}), { detail: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				style: noteStyle,
				children: t(SETUP_GUIDANCE_KEY)
			}) });
			if (confirming) return card(/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tag, {
				tone: "warning",
				children: t("entry.chip.authorize")
			}), { detail: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: {
					display: "flex",
					flexDirection: "column",
					gap: 8,
					fontSize: 12
				},
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: { opacity: .8 },
						children: t("entry.authorizeIntro")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
						style: {
							margin: 0,
							paddingLeft: 16,
							lineHeight: 1.6,
							opacity: .85
						},
						children: AUTHORIZATION_POINTS.map((point) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("li", { children: t(point) }, point))
					}),
					storage === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: { opacity: .85 },
						children: [t("entry.authorize.storage", { target: storage.target }), storage.ignoredReason === void 0 ? "" : `（${storage.ignoredReason}）`]
					}),
					storage?.migrationHint === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: { opacity: .85 },
						children: storage.migrationHint
					}),
					storage?.kind === "bind" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: { opacity: .85 },
						children: t("entry.authorize.storageBindRisk")
					}) : null,
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
						style: {
							display: "flex",
							gap: 6,
							alignItems: "center",
							opacity: .85
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							type: "checkbox",
							onChange: (event) => onApprove(event.target.checked)
						}), t("entry.remember")]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: {
							display: "flex",
							gap: 8
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
							size: "sm",
							variant: "outline",
							onClick: onCancel,
							children: t("entry.cancel")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
							size: "sm",
							variant: "primary",
							onClick: onConfirmStart,
							children: t("entry.authorize")
						})]
					})
				]
			}) });
			const inProgress = phase === "pulling" || phase === "starting" || phase === "stopping" || phase === "exporting" || phase === "importing";
			if (state === "running") return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: {
					display: "flex",
					flexDirection: "column",
					gap: 8
				},
				children: [card(/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tag, {
					tone: "success",
					children: t("entry.chip.running")
				}), { meta: t("entry.screen.title", { name: botSlug ?? "PersonaBot" }) }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(RunningCard, {
					t,
					botSlug,
					busy,
					stopping: phase === "stopping",
					...resolution === void 0 ? {} : { resolution },
					onStop
				})]
			});
			if (inProgress) return card(/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tag, {
				tone: "info",
				children: t(PHASE_LABEL[phase] ?? "entry.phase.working")
			}), {
				meta: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [t("entry.elapsed", { seconds: elapsed }), progress?.updatedAt === void 0 ? "" : ` · ${t("entry.updated", { seconds: Math.max(0, Math.round((nowTs - progress.updatedAt) / 1e3)) })}`] }),
				detail: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: {
						display: "flex",
						flexDirection: "column",
						gap: 8,
						fontSize: 12
					},
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: {
							position: "relative",
							overflow: "hidden",
							height: 6,
							borderRadius: 3,
							background: BH.borderL4
						},
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { style: progress?.percent === void 0 ? {
							position: "absolute",
							inset: 0,
							background: BH.businessPrimary
						} : {
							position: "absolute",
							left: 0,
							top: 0,
							bottom: 0,
							width: `${String(progress.percent)}%`,
							background: BH.businessPrimary
						} })
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: terminalStyle,
						children: progress?.text ?? detail ?? t("entry.wait")
					})]
				})
			});
			return card(error !== void 0 || state === "failed" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tag, {
				tone: "danger",
				children: t("entry.chip.failed")
			}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tag, {
				tone: "neutral",
				children: t("entry.chip.stopped")
			}), {
				meta: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					style: { whiteSpace: "pre-wrap" },
					children: error ?? (isExitReport(detail) ? void 0 : detail) ?? t(SHARED_NOTE_KEY)
				}),
				detail: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
					size: "sm",
					variant: "primary",
					disabled: busy,
					onClick: onStart,
					children: busy ? t("entry.starting") : t("entry.start")
				})
			});
		}
		function createComputerEntry(t) {
			return function ComputerEntryWithLocale(props) {
				const { computerAccess } = useBotInfo(props.botSlug);
				if (computerAccess === false) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "bh-computer-access-off",
					style: noteStyle,
					children: t("entry.access.description")
				});
				return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ComputerEntry, {
					...props,
					t
				});
			};
		}
		function createComputerBadge(t) {
			return function ComputerBadge({ botSlug }) {
				const { computerAccess } = useBotInfo(botSlug);
				if (computerAccess !== true) return null;
				return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: "bh-channel-sidebar-live-dot",
					role: "img",
					"aria-label": t("entry.access.on")
				});
			};
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
				computerAccess: void 0
			};
			const listeners = /* @__PURE__ */ new Set();
			let loadedAt = Number.NEGATIVE_INFINITY;
			const load = () => {
				const rpc = connectionRpc;
				if (rpc === void 0 || botSlug === void 0) return;
				rpc.call("/api", "botharness/list", { args: {} }).then((result) => {
					if (!result.ok) return;
					const match = (result.value.bots ?? []).find((bot) => bot.slug === botSlug);
					if (match === void 0) return;
					info = {
						displayName: typeof match.displayName === "string" && match.displayName.length > 0 ? match.displayName : void 0,
						computerAccess: match.computerAccess === true
					};
					for (const listener of listeners) listener();
				}).catch(() => void 0);
			};
			return {
				setAccess(enabled) {
					info = {
						...info,
						computerAccess: enabled
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
				getSnapshot: () => info
			};
		}
		function useBotInfo(botSlug) {
			const store = botInfoStore(botSlug);
			const info = (0, react.useSyncExternalStore)(store.subscribe, store.getSnapshot);
			return {
				displayName: info.displayName ?? botSlug,
				computerAccess: info.computerAccess
			};
		}
		function ComputerHeaderAction({ botSlug, t, setExpandable, setExpanded }) {
			const store = botInfoStore(botSlug);
			const [busy, setBusy] = (0, react.useState)(false);
			const inFlight = (0, react.useRef)(false);
			const [error, setError] = (0, react.useState)(false);
			const subscribe = (listener) => {
				const sync = () => {
					setExpandable?.(store.getSnapshot().computerAccess !== void 0);
				};
				const unsubscribe = store.subscribe(() => {
					sync();
					listener();
				});
				sync();
				return unsubscribe;
			};
			const info = (0, react.useSyncExternalStore)(subscribe, store.getSnapshot);
			const accessOn = info.computerAccess === true;
			const onToggle = (next) => {
				const rpc = connectionRpc;
				if (rpc === void 0 || botSlug === void 0 || inFlight.current) return;
				inFlight.current = true;
				setBusy(true);
				setError(false);
				rpc.call("/api", "botharness/computerAccessSet", { args: {
					slug: botSlug,
					enabled: next
				} }).then((result) => {
					if (!result.ok) {
						setError(true);
						return;
					}
					const applied = result.value.bot?.computerAccess === true;
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
				className: "bh-computer-access-control",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tooltip, {
					label: error ? t("entry.access.failed") + ": " + label : label,
					side: "bottom",
					delayMs: 500,
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: `bh-computer-access-power${error ? " bh-access-failed" : ""}`,
						"aria-label": label,
						"aria-pressed": accessOn,
						"aria-busy": busy,
						disabled: busy || botSlug === void 0 || connectionRpc === void 0 || info.computerAccess === void 0,
						onClick: () => onToggle(!accessOn),
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(AccessPowerIcon, {})
					})
				}), error ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: "bh-computer-access-error",
					role: "alert",
					title: t("entry.access.failed"),
					children: t("entry.access.failureHint")
				}) : null]
			});
		}
		function createComputerHeader(t) {
			return function ComputerHeaderWithLocale(props) {
				return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ComputerHeaderAction, {
					...props,
					t
				}, props.botSlug);
			};
		}
		function ComputerEntry({ botSlug, t }) {
			const { displayName } = useBotInfo(botSlug);
			const [payload, setPayload] = (0, react.useState)();
			const [error, setError] = (0, react.useState)();
			const [busy, setBusy] = (0, react.useState)(false);
			const [confirming, setConfirming] = (0, react.useState)(false);
			const [approved, setApproved] = (0, react.useState)(() => globalThis.sessionStorage?.getItem(APPROVED_KEY) === "1");
			const [elapsed, setElapsed] = (0, react.useState)(0);
			const [nowTs, setNowTs] = (0, react.useState)(() => Date.now());
			const refresh = (0, react.useCallback)(async (signal) => {
				try {
					const next = await requestJson(STATUS_ENDPOINT, signal === void 0 ? void 0 : { signal });
					if (signal?.aborted) return;
					setPayload(next);
					setError(void 0);
				} catch (cause) {
					if (!signal?.aborted) setError(String(cause));
				}
			}, []);
			const statusResource = useMountedResource(() => {
				const controller = new AbortController();
				let pending = false;
				const poll = async () => {
					if (pending || controller.signal.aborted) return;
					pending = true;
					try {
						await refresh(AbortSignal.any([controller.signal, AbortSignal.timeout(1e4)]));
					} finally {
						pending = false;
					}
				};
				poll();
				const timer = setInterval(() => void poll(), 3e3);
				return () => {
					controller.abort();
					clearInterval(timer);
				};
			}, [refresh]);
			const phase = payload?.status.phase;
			const inProgress = phase === "pulling" || phase === "starting" || phase === "stopping" || phase === "exporting" || phase === "importing";
			const progressResource = useMountedResource(() => {
				const startedAt = Date.now();
				setElapsed(0);
				const timer = setInterval(() => {
					setNowTs(Date.now());
					setElapsed(Math.round((Date.now() - startedAt) / 1e3));
				}, 1e3);
				return () => clearInterval(timer);
			}, [inProgress]);
			const act = (0, react.useCallback)(async (endpoint) => {
				setBusy(true);
				try {
					await requestJson(endpoint, {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({
							authorize: true,
							...endpoint === START_ENDPOINT && typeof navigator !== "undefined" ? { language: navigator.language } : {}
						})
					});
					await refresh();
				} catch (cause) {
					setError(String(cause));
				} finally {
					setBusy(false);
				}
			}, [refresh]);
			const onStart = (0, react.useCallback)(() => {
				if (!approved) {
					setConfirming(true);
					return;
				}
				act(START_ENDPOINT);
			}, [act, approved]);
			const onConfirmStart = (0, react.useCallback)(() => {
				setConfirming(false);
				act(START_ENDPOINT);
			}, [act]);
			const onApprove = (0, react.useCallback)((remember) => {
				if (remember) {
					globalThis.sessionStorage?.setItem(APPROVED_KEY, "1");
					setApproved(true);
				}
			}, []);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				ref: statusResource,
				style: {
					display: "flex",
					flexDirection: "column",
					gap: 8
				},
				children: [inProgress ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					hidden: true,
					ref: progressResource
				}) : null, payload?.target === "local" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(LocalComputerStatus, { t }) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ComputerEntryView, {
					t,
					state: payload?.status.state ?? "absent",
					...phase === void 0 ? {} : { phase },
					...payload?.status.detail === void 0 ? {} : { detail: payload.status.detail },
					...payload?.status.progress === void 0 ? {} : { progress: payload.status.progress },
					runtimeAvailable: payload?.probe.available ?? true,
					confirming,
					busy,
					elapsed,
					nowTs,
					...error === void 0 ? {} : { error },
					...displayName === void 0 ? {} : { botSlug: displayName },
					...payload?.status.storage === void 0 ? {} : { storage: payload.status.storage },
					...payload?.resolution === void 0 ? {} : { resolution: payload.resolution },
					onStart,
					onConfirmStart,
					onStop: () => void act(STOP_ENDPOINT),
					onApprove,
					onCancel: () => setConfirming(false)
				})]
			});
		}
		function apply(ctx) {
			botInfoStores.clear();
			const settingsPrefs = new ComputerSettingsPrefs();
			ctx.inject(["configForms"], (settingsCtx) => {
				const scope = settingsCtx.configForms.get(COMPUTER_SETTINGS_NAMESPACE);
				const release = settingsPrefs.attach(scope);
				return () => {
					release();
				};
			});
			ctx.inject(["uiWorkspace", "slots"], (workspaceCtx) => {
				const workspace = workspaceCtx.uiWorkspace;
				const face = createComputerSettingsFace({
					prefs: settingsPrefs,
					pickDirectory: workspace?.pickDirectory?.bind(workspace)
				});
				workspaceCtx.slots.inject("botharness.settings.section", () => workspaceCtx.slots.register({
					name: "botharness.settings.section",
					id: "computer",
					order: 30,
					label: () => t("section.title"),
					locale: LOCALE_NS,
					inject: () => face
				}, ComputerSettingsRows));
			});
			ctx.effect(() => {
				if (typeof document === "undefined") return () => {};
				const style = document.createElement("style");
				style.setAttribute("data-botharness-computer", "client");
				style.dataset.plugin = "@botharness/computer";
				style.dataset.pluginCss = "@botharness/computer/client.css";
				style.textContent = ACCESS_STYLE + STYLEX_CSS;
				document.head.appendChild(style);
				return () => {
					style.remove();
				};
			}, "botharness-computer: client styles");
			const t = ctx.locale.bind(LOCALE_NS);
			ctx.effect(() => ctx.locale.register(LOCALE_NS, {
				zh,
				en
			}), "botharness-computer: dictionaries");
			ctx.inject(["channelSidebar", "connection"], (sidebarCtx) => {
				const registry = sidebarCtx.channelSidebar;
				connectionRpc = sidebarCtx.connection?.rpc;
				if (registry === void 0) return;
				ctx.effect(() => registry.register({
					id: ENTRY_ID,
					icon: "monitor",
					label: t("entry.label"),
					order: 40,
					scope: "personabot",
					component: createComputerEntry(t),
					headerAction: createComputerHeader(t),
					badge: createComputerBadge(t),
					tab: "screen"
				}), "botharness-computer: channel sidebar entry");
			});
		}
		//#endregion
		exports.ComputerEntryView = ComputerEntryView;
		exports.RecentLogs = RecentLogs;
		exports.RecentLogsList = RecentLogsList;
		exports.ScreenIndicator = ScreenIndicator;
		exports.StreamOverlay = StreamOverlay;
		exports.ViewerTitleBar = ViewerTitleBar;
		exports.apply = apply;
		exports.createComputerBadge = createComputerBadge;
		exports.createComputerEntry = createComputerEntry;
		exports.createComputerHeader = createComputerHeader;
		exports.inject = inject;
		exports.name = name;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map