import { a as __require, t as __commonJSMin } from "./chunk-iyeSoAlh.js";
import { a as require_axios, i as require_logging, n as require_lib$1, r as require_http$2, t as require_dist$3 } from "./dist-C9YIWQu9.js";
import { t as require_jsonwebtoken } from "./jsonwebtoken-Dk2CZEfK.js";
import { t as require_src } from "./src-CARdfqy1.js";
//#region node_modules/@microsoft/teams.common/dist/events/event-emitter.js
var require_event_emitter = /* @__PURE__ */ __commonJSMin(((exports) => {
	var EventEmitter = class {
		index = -1;
		subscriptions = /* @__PURE__ */ new Map();
		on(event, handler) {
			const id = ++this.index;
			const subs = this.subscriptions.get(event) || [];
			subs.push({
				id,
				handler
			});
			this.subscriptions.set(event, subs);
			return id;
		}
		once(event, handler) {
			const id = this.on(event, (value) => {
				this.off(id);
				handler(value);
			});
			return id;
		}
		off(id) {
			for (const [_, subs] of this.subscriptions.entries()) {
				const i = subs.findIndex((s) => s.id === id);
				if (i === -1) continue;
				subs.splice(i, 1);
				return;
			}
		}
		emit(event, value) {
			const subs = this.subscriptions.get(event) || [];
			for (const sub of subs) sub.handler(value);
		}
	};
	exports.EventEmitter = EventEmitter;
}));
//#endregion
//#region node_modules/@microsoft/teams.common/dist/events/index.js
var require_events$1 = /* @__PURE__ */ __commonJSMin(((exports) => {
	var eventEmitter = require_event_emitter();
	Object.keys(eventEmitter).forEach(function(k) {
		if (k !== "default" && !Object.prototype.hasOwnProperty.call(exports, k)) Object.defineProperty(exports, k, {
			enumerable: true,
			get: function() {
				return eventEmitter[k];
			}
		});
	});
}));
//#endregion
//#region node_modules/@microsoft/teams.common/dist/storage/list-local-storage.js
var require_list_local_storage = /* @__PURE__ */ __commonJSMin(((exports) => {
	var ListLocalStorage = class {
		_list;
		constructor(data = []) {
			this._list = [...data];
		}
		get(key) {
			return this._list[key];
		}
		set(key, value) {
			this._list[key] = value;
		}
		delete(key) {
			this._list.splice(key, 1);
		}
		push(value) {
			this._list.push(value);
		}
		pop() {
			return this._list.pop();
		}
		values() {
			return [...this._list];
		}
		length() {
			return this._list.length;
		}
		where(predicate) {
			return this._list.filter(predicate);
		}
	};
	exports.ListLocalStorage = ListLocalStorage;
}));
//#endregion
//#region node_modules/@microsoft/teams.common/dist/storage/local-storage.js
var require_local_storage = /* @__PURE__ */ __commonJSMin(((exports) => {
	var LocalStorage = class {
		_store;
		_keys;
		_options;
		get keys() {
			return this._keys;
		}
		get size() {
			return this._store.size;
		}
		constructor(data = {}, options = {}) {
			this._store = new Map(Object.entries(data));
			this._keys = Object.keys(data);
			this._options = options;
		}
		get(key) {
			this._hit(key);
			return this._store.get(key);
		}
		set(key, value) {
			if (!this._hit(key)) this._keys.push(key);
			if (this._options.max) {
				if (this._keys.length > this._options.max) {
					const k = this._keys.shift();
					if (k) this._store.delete(k);
				}
			}
			this._store.set(key, value);
		}
		delete(key) {
			const i = this._keys.findIndex((k) => key === k);
			if (i > -1) this._keys.splice(i, 1);
			this._store.delete(key);
		}
		toString() {
			return JSON.stringify(Array.from(this._store.entries()).map(([key, value]) => ({
				key,
				value
			})), null, 2);
		}
		_hit(key) {
			if (!this._store.has(key)) return false;
			if (this._keys[this._keys.length - 1] === key) return true;
			const idx = this._keys.findIndex((k) => key === k);
			if (idx < 0) return false;
			for (let i = idx + 1; i < this._keys.length; i++) {
				const tmp = this._keys[i - 1];
				this._keys[i - 1] = this._keys[i];
				this._keys[i] = tmp;
			}
			return true;
		}
	};
	exports.LocalStorage = LocalStorage;
}));
//#endregion
//#region node_modules/@microsoft/teams.common/dist/storage/storage.js
var require_storage$1 = /* @__PURE__ */ __commonJSMin((() => {}));
//#endregion
//#region node_modules/@microsoft/teams.common/dist/storage/index.js
var require_storage = /* @__PURE__ */ __commonJSMin(((exports) => {
	var listLocalStorage = require_list_local_storage();
	var localStorage = require_local_storage();
	var storage = require_storage$1();
	Object.keys(listLocalStorage).forEach(function(k) {
		if (k !== "default" && !Object.prototype.hasOwnProperty.call(exports, k)) Object.defineProperty(exports, k, {
			enumerable: true,
			get: function() {
				return listLocalStorage[k];
			}
		});
	});
	Object.keys(localStorage).forEach(function(k) {
		if (k !== "default" && !Object.prototype.hasOwnProperty.call(exports, k)) Object.defineProperty(exports, k, {
			enumerable: true,
			get: function() {
				return localStorage[k];
			}
		});
	});
	Object.keys(storage).forEach(function(k) {
		if (k !== "default" && !Object.prototype.hasOwnProperty.call(exports, k)) Object.defineProperty(exports, k, {
			enumerable: true,
			get: function() {
				return storage[k];
			}
		});
	});
}));
//#endregion
//#region node_modules/@microsoft/teams.apps/package.json
var require_package = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	module.exports = {
		"name": "@microsoft/teams.apps",
		"version": "2.0.9",
		"license": "MIT",
		"main": "./dist/index.js",
		"module": "./dist/index.mjs",
		"types": "./dist/index.d.ts",
		"homepage": "https://github.com/microsoft/teams.ts",
		"bugs": "https://github.com/microsoft/teams.ts/issues",
		"files": ["dist", "README.md"],
		"engines": { "node": ">=20" },
		"repository": {
			"type": "git",
			"url": "https://github.com/microsoft/teams.ts.git",
			"directory": "packages/apps"
		},
		"keywords": [
			"microsoft",
			"teams",
			"msteams",
			"copilot",
			"ai",
			"adaptive-cards",
			"apps",
			"bots"
		],
		"scripts": {
			"clean": "npx rimraf ./dist",
			"lint": "npx eslint",
			"lint:fix": "npx eslint --fix",
			"build": "npx tsc",
			"test": "npx jest",
			"generate": "npx quicktype -s schema -l typescript ./manifest.schema.json -o ./src/manifest.ts --prefer-unions --prefer-types --just-types"
		},
		"dependencies": {
			"@azure/msal-node": "^3.8.1",
			"@microsoft/teams.api": "2.0.9",
			"@microsoft/teams.common": "2.0.9",
			"@microsoft/teams.graph": "2.0.9",
			"axios": "^1.15.2",
			"cors": "^2.8.5",
			"express": "^5.0.0",
			"jsonwebtoken": "^9.0.2",
			"jwks-rsa": "^3.2.0",
			"reflect-metadata": "^0.2.2"
		},
		"devDependencies": {
			"@microsoft/teams.config": "2.0.9",
			"@types/cors": "^2.8.17",
			"@types/express": "^5.0.0",
			"@types/jest": "^29.5.12",
			"@types/node": "^22.0.2",
			"@types/supertest": "^6.0.2",
			"cross-env": "^7.0.3",
			"jest": "^29.7.0",
			"jsonwebtoken": "^9.0.2",
			"quicktype": "^23.0.171",
			"rimraf": "^6.0.1",
			"supertest": "^7.0.0",
			"ts-jest": "^29.2.5",
			"tsup": "^8.4.0",
			"typescript": "^5.4.5"
		}
	};
}));
//#endregion
//#region node_modules/@microsoft/teams.common/dist/index.js
var require_dist$2 = /* @__PURE__ */ __commonJSMin(((exports) => {
	var events = require_events$1();
	var http = require_http$2();
	var logging = require_logging();
	var storage = require_storage();
	Object.keys(events).forEach(function(k) {
		if (k !== "default" && !Object.prototype.hasOwnProperty.call(exports, k)) Object.defineProperty(exports, k, {
			enumerable: true,
			get: function() {
				return events[k];
			}
		});
	});
	Object.keys(http).forEach(function(k) {
		if (k !== "default" && !Object.prototype.hasOwnProperty.call(exports, k)) Object.defineProperty(exports, k, {
			enumerable: true,
			get: function() {
				return http[k];
			}
		});
	});
	Object.keys(logging).forEach(function(k) {
		if (k !== "default" && !Object.prototype.hasOwnProperty.call(exports, k)) Object.defineProperty(exports, k, {
			enumerable: true,
			get: function() {
				return logging[k];
			}
		});
	});
	Object.keys(storage).forEach(function(k) {
		if (k !== "default" && !Object.prototype.hasOwnProperty.call(exports, k)) Object.defineProperty(exports, k, {
			enumerable: true,
			get: function() {
				return storage[k];
			}
		});
	});
}));
//#endregion
//#region node_modules/@microsoft/teams.apps/dist/types/app-events.js
var require_app_events$1 = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
}));
//#endregion
//#region node_modules/@microsoft/teams.apps/dist/types/event-handler.js
var require_event_handler = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
}));
//#endregion
//#region node_modules/@microsoft/teams.apps/dist/types/plugin/plugin.js
var require_plugin$3 = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
}));
//#endregion
//#region node_modules/@microsoft/teams.apps/dist/types/plugin/plugin-activity-event.js
var require_plugin_activity_event = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
}));
//#endregion
//#region node_modules/@microsoft/teams.apps/dist/types/plugin/plugin-activity-sent-event.js
var require_plugin_activity_sent_event = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
}));
//#endregion
//#region node_modules/@microsoft/teams.apps/dist/types/plugin/plugin-activity-response-event.js
var require_plugin_activity_response_event = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
}));
//#endregion
//#region node_modules/@microsoft/teams.apps/dist/types/plugin/plugin-error-event.js
var require_plugin_error_event = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
}));
//#endregion
//#region node_modules/@microsoft/teams.apps/dist/types/plugin/plugin-start-event.js
var require_plugin_start_event = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
}));
//#endregion
//#region node_modules/@microsoft/teams.apps/dist/types/plugin/sender.js
var require_sender = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
}));
//#endregion
//#region node_modules/reflect-metadata/Reflect.js
var require_Reflect = /* @__PURE__ */ __commonJSMin((() => {
	/*! *****************************************************************************
	Copyright (C) Microsoft. All rights reserved.
	Licensed under the Apache License, Version 2.0 (the "License"); you may not use
	this file except in compliance with the License. You may obtain a copy of the
	License at http://www.apache.org/licenses/LICENSE-2.0
	
	THIS CODE IS PROVIDED ON AN *AS IS* BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
	KIND, EITHER EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION ANY IMPLIED
	WARRANTIES OR CONDITIONS OF TITLE, FITNESS FOR A PARTICULAR PURPOSE,
	MERCHANTABLITY OR NON-INFRINGEMENT.
	
	See the Apache Version 2.0 License for specific language governing permissions
	and limitations under the License.
	***************************************************************************** */
	var Reflect;
	(function(Reflect) {
		(function(factory) {
			var root = typeof globalThis === "object" ? globalThis : typeof global === "object" ? global : typeof self === "object" ? self : typeof this === "object" ? this : sloppyModeThis();
			var exporter = makeExporter(Reflect);
			if (typeof root.Reflect !== "undefined") exporter = makeExporter(root.Reflect, exporter);
			factory(exporter, root);
			if (typeof root.Reflect === "undefined") root.Reflect = Reflect;
			function makeExporter(target, previous) {
				return function(key, value) {
					Object.defineProperty(target, key, {
						configurable: true,
						writable: true,
						value
					});
					if (previous) previous(key, value);
				};
			}
			function functionThis() {
				try {
					return Function("return this;")();
				} catch (_) {}
			}
			function indirectEvalThis() {
				try {
					return (0, eval)("(function() { return this; })()");
				} catch (_) {}
			}
			function sloppyModeThis() {
				return functionThis() || indirectEvalThis();
			}
		})(function(exporter, root) {
			var hasOwn = Object.prototype.hasOwnProperty;
			var supportsSymbol = typeof Symbol === "function";
			var toPrimitiveSymbol = supportsSymbol && typeof Symbol.toPrimitive !== "undefined" ? Symbol.toPrimitive : "@@toPrimitive";
			var iteratorSymbol = supportsSymbol && typeof Symbol.iterator !== "undefined" ? Symbol.iterator : "@@iterator";
			var supportsCreate = typeof Object.create === "function";
			var supportsProto = { __proto__: [] } instanceof Array;
			var downLevel = !supportsCreate && !supportsProto;
			var HashMap = {
				create: supportsCreate ? function() {
					return MakeDictionary(Object.create(null));
				} : supportsProto ? function() {
					return MakeDictionary({ __proto__: null });
				} : function() {
					return MakeDictionary({});
				},
				has: downLevel ? function(map, key) {
					return hasOwn.call(map, key);
				} : function(map, key) {
					return key in map;
				},
				get: downLevel ? function(map, key) {
					return hasOwn.call(map, key) ? map[key] : void 0;
				} : function(map, key) {
					return map[key];
				}
			};
			var functionPrototype = Object.getPrototypeOf(Function);
			var _Map = typeof Map === "function" && typeof Map.prototype.entries === "function" ? Map : CreateMapPolyfill();
			var _Set = typeof Set === "function" && typeof Set.prototype.entries === "function" ? Set : CreateSetPolyfill();
			var _WeakMap = typeof WeakMap === "function" ? WeakMap : CreateWeakMapPolyfill();
			var registrySymbol = supportsSymbol ? Symbol.for("@reflect-metadata:registry") : void 0;
			var metadataRegistry = GetOrCreateMetadataRegistry();
			var metadataProvider = CreateMetadataProvider(metadataRegistry);
			/**
			* Applies a set of decorators to a property of a target object.
			* @param decorators An array of decorators.
			* @param target The target object.
			* @param propertyKey (Optional) The property key to decorate.
			* @param attributes (Optional) The property descriptor for the target key.
			* @remarks Decorators are applied in reverse order.
			* @example
			*
			*     class Example {
			*         // property declarations are not part of ES6, though they are valid in TypeScript:
			*         // static staticProperty;
			*         // property;
			*
			*         constructor(p) { }
			*         static staticMethod(p) { }
			*         method(p) { }
			*     }
			*
			*     // constructor
			*     Example = Reflect.decorate(decoratorsArray, Example);
			*
			*     // property (on constructor)
			*     Reflect.decorate(decoratorsArray, Example, "staticProperty");
			*
			*     // property (on prototype)
			*     Reflect.decorate(decoratorsArray, Example.prototype, "property");
			*
			*     // method (on constructor)
			*     Object.defineProperty(Example, "staticMethod",
			*         Reflect.decorate(decoratorsArray, Example, "staticMethod",
			*             Object.getOwnPropertyDescriptor(Example, "staticMethod")));
			*
			*     // method (on prototype)
			*     Object.defineProperty(Example.prototype, "method",
			*         Reflect.decorate(decoratorsArray, Example.prototype, "method",
			*             Object.getOwnPropertyDescriptor(Example.prototype, "method")));
			*
			*/
			function decorate(decorators, target, propertyKey, attributes) {
				if (!IsUndefined(propertyKey)) {
					if (!IsArray(decorators)) throw new TypeError();
					if (!IsObject(target)) throw new TypeError();
					if (!IsObject(attributes) && !IsUndefined(attributes) && !IsNull(attributes)) throw new TypeError();
					if (IsNull(attributes)) attributes = void 0;
					propertyKey = ToPropertyKey(propertyKey);
					return DecorateProperty(decorators, target, propertyKey, attributes);
				} else {
					if (!IsArray(decorators)) throw new TypeError();
					if (!IsConstructor(target)) throw new TypeError();
					return DecorateConstructor(decorators, target);
				}
			}
			exporter("decorate", decorate);
			/**
			* A default metadata decorator factory that can be used on a class, class member, or parameter.
			* @param metadataKey The key for the metadata entry.
			* @param metadataValue The value for the metadata entry.
			* @returns A decorator function.
			* @remarks
			* If `metadataKey` is already defined for the target and target key, the
			* metadataValue for that key will be overwritten.
			* @example
			*
			*     // constructor
			*     @Reflect.metadata(key, value)
			*     class Example {
			*     }
			*
			*     // property (on constructor, TypeScript only)
			*     class Example {
			*         @Reflect.metadata(key, value)
			*         static staticProperty;
			*     }
			*
			*     // property (on prototype, TypeScript only)
			*     class Example {
			*         @Reflect.metadata(key, value)
			*         property;
			*     }
			*
			*     // method (on constructor)
			*     class Example {
			*         @Reflect.metadata(key, value)
			*         static staticMethod() { }
			*     }
			*
			*     // method (on prototype)
			*     class Example {
			*         @Reflect.metadata(key, value)
			*         method() { }
			*     }
			*
			*/
			function metadata(metadataKey, metadataValue) {
				function decorator(target, propertyKey) {
					if (!IsObject(target)) throw new TypeError();
					if (!IsUndefined(propertyKey) && !IsPropertyKey(propertyKey)) throw new TypeError();
					OrdinaryDefineOwnMetadata(metadataKey, metadataValue, target, propertyKey);
				}
				return decorator;
			}
			exporter("metadata", metadata);
			/**
			* Define a unique metadata entry on the target.
			* @param metadataKey A key used to store and retrieve metadata.
			* @param metadataValue A value that contains attached metadata.
			* @param target The target object on which to define metadata.
			* @param propertyKey (Optional) The property key for the target.
			* @example
			*
			*     class Example {
			*         // property declarations are not part of ES6, though they are valid in TypeScript:
			*         // static staticProperty;
			*         // property;
			*
			*         constructor(p) { }
			*         static staticMethod(p) { }
			*         method(p) { }
			*     }
			*
			*     // constructor
			*     Reflect.defineMetadata("custom:annotation", options, Example);
			*
			*     // property (on constructor)
			*     Reflect.defineMetadata("custom:annotation", options, Example, "staticProperty");
			*
			*     // property (on prototype)
			*     Reflect.defineMetadata("custom:annotation", options, Example.prototype, "property");
			*
			*     // method (on constructor)
			*     Reflect.defineMetadata("custom:annotation", options, Example, "staticMethod");
			*
			*     // method (on prototype)
			*     Reflect.defineMetadata("custom:annotation", options, Example.prototype, "method");
			*
			*     // decorator factory as metadata-producing annotation.
			*     function MyAnnotation(options): Decorator {
			*         return (target, key?) => Reflect.defineMetadata("custom:annotation", options, target, key);
			*     }
			*
			*/
			function defineMetadata(metadataKey, metadataValue, target, propertyKey) {
				if (!IsObject(target)) throw new TypeError();
				if (!IsUndefined(propertyKey)) propertyKey = ToPropertyKey(propertyKey);
				return OrdinaryDefineOwnMetadata(metadataKey, metadataValue, target, propertyKey);
			}
			exporter("defineMetadata", defineMetadata);
			/**
			* Gets a value indicating whether the target object or its prototype chain has the provided metadata key defined.
			* @param metadataKey A key used to store and retrieve metadata.
			* @param target The target object on which the metadata is defined.
			* @param propertyKey (Optional) The property key for the target.
			* @returns `true` if the metadata key was defined on the target object or its prototype chain; otherwise, `false`.
			* @example
			*
			*     class Example {
			*         // property declarations are not part of ES6, though they are valid in TypeScript:
			*         // static staticProperty;
			*         // property;
			*
			*         constructor(p) { }
			*         static staticMethod(p) { }
			*         method(p) { }
			*     }
			*
			*     // constructor
			*     result = Reflect.hasMetadata("custom:annotation", Example);
			*
			*     // property (on constructor)
			*     result = Reflect.hasMetadata("custom:annotation", Example, "staticProperty");
			*
			*     // property (on prototype)
			*     result = Reflect.hasMetadata("custom:annotation", Example.prototype, "property");
			*
			*     // method (on constructor)
			*     result = Reflect.hasMetadata("custom:annotation", Example, "staticMethod");
			*
			*     // method (on prototype)
			*     result = Reflect.hasMetadata("custom:annotation", Example.prototype, "method");
			*
			*/
			function hasMetadata(metadataKey, target, propertyKey) {
				if (!IsObject(target)) throw new TypeError();
				if (!IsUndefined(propertyKey)) propertyKey = ToPropertyKey(propertyKey);
				return OrdinaryHasMetadata(metadataKey, target, propertyKey);
			}
			exporter("hasMetadata", hasMetadata);
			/**
			* Gets a value indicating whether the target object has the provided metadata key defined.
			* @param metadataKey A key used to store and retrieve metadata.
			* @param target The target object on which the metadata is defined.
			* @param propertyKey (Optional) The property key for the target.
			* @returns `true` if the metadata key was defined on the target object; otherwise, `false`.
			* @example
			*
			*     class Example {
			*         // property declarations are not part of ES6, though they are valid in TypeScript:
			*         // static staticProperty;
			*         // property;
			*
			*         constructor(p) { }
			*         static staticMethod(p) { }
			*         method(p) { }
			*     }
			*
			*     // constructor
			*     result = Reflect.hasOwnMetadata("custom:annotation", Example);
			*
			*     // property (on constructor)
			*     result = Reflect.hasOwnMetadata("custom:annotation", Example, "staticProperty");
			*
			*     // property (on prototype)
			*     result = Reflect.hasOwnMetadata("custom:annotation", Example.prototype, "property");
			*
			*     // method (on constructor)
			*     result = Reflect.hasOwnMetadata("custom:annotation", Example, "staticMethod");
			*
			*     // method (on prototype)
			*     result = Reflect.hasOwnMetadata("custom:annotation", Example.prototype, "method");
			*
			*/
			function hasOwnMetadata(metadataKey, target, propertyKey) {
				if (!IsObject(target)) throw new TypeError();
				if (!IsUndefined(propertyKey)) propertyKey = ToPropertyKey(propertyKey);
				return OrdinaryHasOwnMetadata(metadataKey, target, propertyKey);
			}
			exporter("hasOwnMetadata", hasOwnMetadata);
			/**
			* Gets the metadata value for the provided metadata key on the target object or its prototype chain.
			* @param metadataKey A key used to store and retrieve metadata.
			* @param target The target object on which the metadata is defined.
			* @param propertyKey (Optional) The property key for the target.
			* @returns The metadata value for the metadata key if found; otherwise, `undefined`.
			* @example
			*
			*     class Example {
			*         // property declarations are not part of ES6, though they are valid in TypeScript:
			*         // static staticProperty;
			*         // property;
			*
			*         constructor(p) { }
			*         static staticMethod(p) { }
			*         method(p) { }
			*     }
			*
			*     // constructor
			*     result = Reflect.getMetadata("custom:annotation", Example);
			*
			*     // property (on constructor)
			*     result = Reflect.getMetadata("custom:annotation", Example, "staticProperty");
			*
			*     // property (on prototype)
			*     result = Reflect.getMetadata("custom:annotation", Example.prototype, "property");
			*
			*     // method (on constructor)
			*     result = Reflect.getMetadata("custom:annotation", Example, "staticMethod");
			*
			*     // method (on prototype)
			*     result = Reflect.getMetadata("custom:annotation", Example.prototype, "method");
			*
			*/
			function getMetadata(metadataKey, target, propertyKey) {
				if (!IsObject(target)) throw new TypeError();
				if (!IsUndefined(propertyKey)) propertyKey = ToPropertyKey(propertyKey);
				return OrdinaryGetMetadata(metadataKey, target, propertyKey);
			}
			exporter("getMetadata", getMetadata);
			/**
			* Gets the metadata value for the provided metadata key on the target object.
			* @param metadataKey A key used to store and retrieve metadata.
			* @param target The target object on which the metadata is defined.
			* @param propertyKey (Optional) The property key for the target.
			* @returns The metadata value for the metadata key if found; otherwise, `undefined`.
			* @example
			*
			*     class Example {
			*         // property declarations are not part of ES6, though they are valid in TypeScript:
			*         // static staticProperty;
			*         // property;
			*
			*         constructor(p) { }
			*         static staticMethod(p) { }
			*         method(p) { }
			*     }
			*
			*     // constructor
			*     result = Reflect.getOwnMetadata("custom:annotation", Example);
			*
			*     // property (on constructor)
			*     result = Reflect.getOwnMetadata("custom:annotation", Example, "staticProperty");
			*
			*     // property (on prototype)
			*     result = Reflect.getOwnMetadata("custom:annotation", Example.prototype, "property");
			*
			*     // method (on constructor)
			*     result = Reflect.getOwnMetadata("custom:annotation", Example, "staticMethod");
			*
			*     // method (on prototype)
			*     result = Reflect.getOwnMetadata("custom:annotation", Example.prototype, "method");
			*
			*/
			function getOwnMetadata(metadataKey, target, propertyKey) {
				if (!IsObject(target)) throw new TypeError();
				if (!IsUndefined(propertyKey)) propertyKey = ToPropertyKey(propertyKey);
				return OrdinaryGetOwnMetadata(metadataKey, target, propertyKey);
			}
			exporter("getOwnMetadata", getOwnMetadata);
			/**
			* Gets the metadata keys defined on the target object or its prototype chain.
			* @param target The target object on which the metadata is defined.
			* @param propertyKey (Optional) The property key for the target.
			* @returns An array of unique metadata keys.
			* @example
			*
			*     class Example {
			*         // property declarations are not part of ES6, though they are valid in TypeScript:
			*         // static staticProperty;
			*         // property;
			*
			*         constructor(p) { }
			*         static staticMethod(p) { }
			*         method(p) { }
			*     }
			*
			*     // constructor
			*     result = Reflect.getMetadataKeys(Example);
			*
			*     // property (on constructor)
			*     result = Reflect.getMetadataKeys(Example, "staticProperty");
			*
			*     // property (on prototype)
			*     result = Reflect.getMetadataKeys(Example.prototype, "property");
			*
			*     // method (on constructor)
			*     result = Reflect.getMetadataKeys(Example, "staticMethod");
			*
			*     // method (on prototype)
			*     result = Reflect.getMetadataKeys(Example.prototype, "method");
			*
			*/
			function getMetadataKeys(target, propertyKey) {
				if (!IsObject(target)) throw new TypeError();
				if (!IsUndefined(propertyKey)) propertyKey = ToPropertyKey(propertyKey);
				return OrdinaryMetadataKeys(target, propertyKey);
			}
			exporter("getMetadataKeys", getMetadataKeys);
			/**
			* Gets the unique metadata keys defined on the target object.
			* @param target The target object on which the metadata is defined.
			* @param propertyKey (Optional) The property key for the target.
			* @returns An array of unique metadata keys.
			* @example
			*
			*     class Example {
			*         // property declarations are not part of ES6, though they are valid in TypeScript:
			*         // static staticProperty;
			*         // property;
			*
			*         constructor(p) { }
			*         static staticMethod(p) { }
			*         method(p) { }
			*     }
			*
			*     // constructor
			*     result = Reflect.getOwnMetadataKeys(Example);
			*
			*     // property (on constructor)
			*     result = Reflect.getOwnMetadataKeys(Example, "staticProperty");
			*
			*     // property (on prototype)
			*     result = Reflect.getOwnMetadataKeys(Example.prototype, "property");
			*
			*     // method (on constructor)
			*     result = Reflect.getOwnMetadataKeys(Example, "staticMethod");
			*
			*     // method (on prototype)
			*     result = Reflect.getOwnMetadataKeys(Example.prototype, "method");
			*
			*/
			function getOwnMetadataKeys(target, propertyKey) {
				if (!IsObject(target)) throw new TypeError();
				if (!IsUndefined(propertyKey)) propertyKey = ToPropertyKey(propertyKey);
				return OrdinaryOwnMetadataKeys(target, propertyKey);
			}
			exporter("getOwnMetadataKeys", getOwnMetadataKeys);
			/**
			* Deletes the metadata entry from the target object with the provided key.
			* @param metadataKey A key used to store and retrieve metadata.
			* @param target The target object on which the metadata is defined.
			* @param propertyKey (Optional) The property key for the target.
			* @returns `true` if the metadata entry was found and deleted; otherwise, false.
			* @example
			*
			*     class Example {
			*         // property declarations are not part of ES6, though they are valid in TypeScript:
			*         // static staticProperty;
			*         // property;
			*
			*         constructor(p) { }
			*         static staticMethod(p) { }
			*         method(p) { }
			*     }
			*
			*     // constructor
			*     result = Reflect.deleteMetadata("custom:annotation", Example);
			*
			*     // property (on constructor)
			*     result = Reflect.deleteMetadata("custom:annotation", Example, "staticProperty");
			*
			*     // property (on prototype)
			*     result = Reflect.deleteMetadata("custom:annotation", Example.prototype, "property");
			*
			*     // method (on constructor)
			*     result = Reflect.deleteMetadata("custom:annotation", Example, "staticMethod");
			*
			*     // method (on prototype)
			*     result = Reflect.deleteMetadata("custom:annotation", Example.prototype, "method");
			*
			*/
			function deleteMetadata(metadataKey, target, propertyKey) {
				if (!IsObject(target)) throw new TypeError();
				if (!IsUndefined(propertyKey)) propertyKey = ToPropertyKey(propertyKey);
				if (!IsObject(target)) throw new TypeError();
				if (!IsUndefined(propertyKey)) propertyKey = ToPropertyKey(propertyKey);
				var provider = GetMetadataProvider(target, propertyKey, false);
				if (IsUndefined(provider)) return false;
				return provider.OrdinaryDeleteMetadata(metadataKey, target, propertyKey);
			}
			exporter("deleteMetadata", deleteMetadata);
			function DecorateConstructor(decorators, target) {
				for (var i = decorators.length - 1; i >= 0; --i) {
					var decorator = decorators[i];
					var decorated = decorator(target);
					if (!IsUndefined(decorated) && !IsNull(decorated)) {
						if (!IsConstructor(decorated)) throw new TypeError();
						target = decorated;
					}
				}
				return target;
			}
			function DecorateProperty(decorators, target, propertyKey, descriptor) {
				for (var i = decorators.length - 1; i >= 0; --i) {
					var decorator = decorators[i];
					var decorated = decorator(target, propertyKey, descriptor);
					if (!IsUndefined(decorated) && !IsNull(decorated)) {
						if (!IsObject(decorated)) throw new TypeError();
						descriptor = decorated;
					}
				}
				return descriptor;
			}
			function OrdinaryHasMetadata(MetadataKey, O, P) {
				if (OrdinaryHasOwnMetadata(MetadataKey, O, P)) return true;
				var parent = OrdinaryGetPrototypeOf(O);
				if (!IsNull(parent)) return OrdinaryHasMetadata(MetadataKey, parent, P);
				return false;
			}
			function OrdinaryHasOwnMetadata(MetadataKey, O, P) {
				var provider = GetMetadataProvider(O, P, false);
				if (IsUndefined(provider)) return false;
				return ToBoolean(provider.OrdinaryHasOwnMetadata(MetadataKey, O, P));
			}
			function OrdinaryGetMetadata(MetadataKey, O, P) {
				if (OrdinaryHasOwnMetadata(MetadataKey, O, P)) return OrdinaryGetOwnMetadata(MetadataKey, O, P);
				var parent = OrdinaryGetPrototypeOf(O);
				if (!IsNull(parent)) return OrdinaryGetMetadata(MetadataKey, parent, P);
			}
			function OrdinaryGetOwnMetadata(MetadataKey, O, P) {
				var provider = GetMetadataProvider(O, P, false);
				if (IsUndefined(provider)) return;
				return provider.OrdinaryGetOwnMetadata(MetadataKey, O, P);
			}
			function OrdinaryDefineOwnMetadata(MetadataKey, MetadataValue, O, P) {
				GetMetadataProvider(O, P, true).OrdinaryDefineOwnMetadata(MetadataKey, MetadataValue, O, P);
			}
			function OrdinaryMetadataKeys(O, P) {
				var ownKeys = OrdinaryOwnMetadataKeys(O, P);
				var parent = OrdinaryGetPrototypeOf(O);
				if (parent === null) return ownKeys;
				var parentKeys = OrdinaryMetadataKeys(parent, P);
				if (parentKeys.length <= 0) return ownKeys;
				if (ownKeys.length <= 0) return parentKeys;
				var set = new _Set();
				var keys = [];
				for (var _i = 0, ownKeys_1 = ownKeys; _i < ownKeys_1.length; _i++) {
					var key = ownKeys_1[_i];
					var hasKey = set.has(key);
					if (!hasKey) {
						set.add(key);
						keys.push(key);
					}
				}
				for (var _a = 0, parentKeys_1 = parentKeys; _a < parentKeys_1.length; _a++) {
					var key = parentKeys_1[_a];
					var hasKey = set.has(key);
					if (!hasKey) {
						set.add(key);
						keys.push(key);
					}
				}
				return keys;
			}
			function OrdinaryOwnMetadataKeys(O, P) {
				var provider = GetMetadataProvider(O, P, false);
				if (!provider) return [];
				return provider.OrdinaryOwnMetadataKeys(O, P);
			}
			function Type(x) {
				if (x === null) return 1;
				switch (typeof x) {
					case "undefined": return 0;
					case "boolean": return 2;
					case "string": return 3;
					case "symbol": return 4;
					case "number": return 5;
					case "object": return x === null ? 1 : 6;
					default: return 6;
				}
			}
			function IsUndefined(x) {
				return x === void 0;
			}
			function IsNull(x) {
				return x === null;
			}
			function IsSymbol(x) {
				return typeof x === "symbol";
			}
			function IsObject(x) {
				return typeof x === "object" ? x !== null : typeof x === "function";
			}
			function ToPrimitive(input, PreferredType) {
				switch (Type(input)) {
					case 0: return input;
					case 1: return input;
					case 2: return input;
					case 3: return input;
					case 4: return input;
					case 5: return input;
				}
				var hint = PreferredType === 3 ? "string" : PreferredType === 5 ? "number" : "default";
				var exoticToPrim = GetMethod(input, toPrimitiveSymbol);
				if (exoticToPrim !== void 0) {
					var result = exoticToPrim.call(input, hint);
					if (IsObject(result)) throw new TypeError();
					return result;
				}
				return OrdinaryToPrimitive(input, hint === "default" ? "number" : hint);
			}
			function OrdinaryToPrimitive(O, hint) {
				if (hint === "string") {
					var toString_1 = O.toString;
					if (IsCallable(toString_1)) {
						var result = toString_1.call(O);
						if (!IsObject(result)) return result;
					}
					var valueOf = O.valueOf;
					if (IsCallable(valueOf)) {
						var result = valueOf.call(O);
						if (!IsObject(result)) return result;
					}
				} else {
					var valueOf = O.valueOf;
					if (IsCallable(valueOf)) {
						var result = valueOf.call(O);
						if (!IsObject(result)) return result;
					}
					var toString_2 = O.toString;
					if (IsCallable(toString_2)) {
						var result = toString_2.call(O);
						if (!IsObject(result)) return result;
					}
				}
				throw new TypeError();
			}
			function ToBoolean(argument) {
				return !!argument;
			}
			function ToString(argument) {
				return "" + argument;
			}
			function ToPropertyKey(argument) {
				var key = ToPrimitive(argument, 3);
				if (IsSymbol(key)) return key;
				return ToString(key);
			}
			function IsArray(argument) {
				return Array.isArray ? Array.isArray(argument) : argument instanceof Object ? argument instanceof Array : Object.prototype.toString.call(argument) === "[object Array]";
			}
			function IsCallable(argument) {
				return typeof argument === "function";
			}
			function IsConstructor(argument) {
				return typeof argument === "function";
			}
			function IsPropertyKey(argument) {
				switch (Type(argument)) {
					case 3: return true;
					case 4: return true;
					default: return false;
				}
			}
			function SameValueZero(x, y) {
				return x === y || x !== x && y !== y;
			}
			function GetMethod(V, P) {
				var func = V[P];
				if (func === void 0 || func === null) return void 0;
				if (!IsCallable(func)) throw new TypeError();
				return func;
			}
			function GetIterator(obj) {
				var method = GetMethod(obj, iteratorSymbol);
				if (!IsCallable(method)) throw new TypeError();
				var iterator = method.call(obj);
				if (!IsObject(iterator)) throw new TypeError();
				return iterator;
			}
			function IteratorValue(iterResult) {
				return iterResult.value;
			}
			function IteratorStep(iterator) {
				var result = iterator.next();
				return result.done ? false : result;
			}
			function IteratorClose(iterator) {
				var f = iterator["return"];
				if (f) f.call(iterator);
			}
			function OrdinaryGetPrototypeOf(O) {
				var proto = Object.getPrototypeOf(O);
				if (typeof O !== "function" || O === functionPrototype) return proto;
				if (proto !== functionPrototype) return proto;
				var prototype = O.prototype;
				var prototypeProto = prototype && Object.getPrototypeOf(prototype);
				if (prototypeProto == null || prototypeProto === Object.prototype) return proto;
				var constructor = prototypeProto.constructor;
				if (typeof constructor !== "function") return proto;
				if (constructor === O) return proto;
				return constructor;
			}
			/**
			* Creates a registry used to allow multiple `reflect-metadata` providers.
			*/
			function CreateMetadataRegistry() {
				var fallback;
				if (!IsUndefined(registrySymbol) && typeof root.Reflect !== "undefined" && !(registrySymbol in root.Reflect) && typeof root.Reflect.defineMetadata === "function") fallback = CreateFallbackProvider(root.Reflect);
				var first;
				var second;
				var rest;
				var targetProviderMap = new _WeakMap();
				var registry = {
					registerProvider,
					getProvider,
					setProvider
				};
				return registry;
				function registerProvider(provider) {
					if (!Object.isExtensible(registry)) throw new Error("Cannot add provider to a frozen registry.");
					switch (true) {
						case fallback === provider: break;
						case IsUndefined(first):
							first = provider;
							break;
						case first === provider: break;
						case IsUndefined(second):
							second = provider;
							break;
						case second === provider: break;
						default:
							if (rest === void 0) rest = new _Set();
							rest.add(provider);
							break;
					}
				}
				function getProviderNoCache(O, P) {
					if (!IsUndefined(first)) {
						if (first.isProviderFor(O, P)) return first;
						if (!IsUndefined(second)) {
							if (second.isProviderFor(O, P)) return first;
							if (!IsUndefined(rest)) {
								var iterator = GetIterator(rest);
								while (true) {
									var next = IteratorStep(iterator);
									if (!next) return;
									var provider = IteratorValue(next);
									if (provider.isProviderFor(O, P)) {
										IteratorClose(iterator);
										return provider;
									}
								}
							}
						}
					}
					if (!IsUndefined(fallback) && fallback.isProviderFor(O, P)) return fallback;
				}
				function getProvider(O, P) {
					var providerMap = targetProviderMap.get(O);
					var provider;
					if (!IsUndefined(providerMap)) provider = providerMap.get(P);
					if (!IsUndefined(provider)) return provider;
					provider = getProviderNoCache(O, P);
					if (!IsUndefined(provider)) {
						if (IsUndefined(providerMap)) {
							providerMap = new _Map();
							targetProviderMap.set(O, providerMap);
						}
						providerMap.set(P, provider);
					}
					return provider;
				}
				function hasProvider(provider) {
					if (IsUndefined(provider)) throw new TypeError();
					return first === provider || second === provider || !IsUndefined(rest) && rest.has(provider);
				}
				function setProvider(O, P, provider) {
					if (!hasProvider(provider)) throw new Error("Metadata provider not registered.");
					var existingProvider = getProvider(O, P);
					if (existingProvider !== provider) {
						if (!IsUndefined(existingProvider)) return false;
						var providerMap = targetProviderMap.get(O);
						if (IsUndefined(providerMap)) {
							providerMap = new _Map();
							targetProviderMap.set(O, providerMap);
						}
						providerMap.set(P, provider);
					}
					return true;
				}
			}
			/**
			* Gets or creates the shared registry of metadata providers.
			*/
			function GetOrCreateMetadataRegistry() {
				var metadataRegistry;
				if (!IsUndefined(registrySymbol) && IsObject(root.Reflect) && Object.isExtensible(root.Reflect)) metadataRegistry = root.Reflect[registrySymbol];
				if (IsUndefined(metadataRegistry)) metadataRegistry = CreateMetadataRegistry();
				if (!IsUndefined(registrySymbol) && IsObject(root.Reflect) && Object.isExtensible(root.Reflect)) Object.defineProperty(root.Reflect, registrySymbol, {
					enumerable: false,
					configurable: false,
					writable: false,
					value: metadataRegistry
				});
				return metadataRegistry;
			}
			function CreateMetadataProvider(registry) {
				var metadata = new _WeakMap();
				var provider = {
					isProviderFor: function(O, P) {
						var targetMetadata = metadata.get(O);
						if (IsUndefined(targetMetadata)) return false;
						return targetMetadata.has(P);
					},
					OrdinaryDefineOwnMetadata,
					OrdinaryHasOwnMetadata,
					OrdinaryGetOwnMetadata,
					OrdinaryOwnMetadataKeys,
					OrdinaryDeleteMetadata
				};
				metadataRegistry.registerProvider(provider);
				return provider;
				function GetOrCreateMetadataMap(O, P, Create) {
					var targetMetadata = metadata.get(O);
					var createdTargetMetadata = false;
					if (IsUndefined(targetMetadata)) {
						if (!Create) return void 0;
						targetMetadata = new _Map();
						metadata.set(O, targetMetadata);
						createdTargetMetadata = true;
					}
					var metadataMap = targetMetadata.get(P);
					if (IsUndefined(metadataMap)) {
						if (!Create) return void 0;
						metadataMap = new _Map();
						targetMetadata.set(P, metadataMap);
						if (!registry.setProvider(O, P, provider)) {
							targetMetadata.delete(P);
							if (createdTargetMetadata) metadata.delete(O);
							throw new Error("Wrong provider for target.");
						}
					}
					return metadataMap;
				}
				function OrdinaryHasOwnMetadata(MetadataKey, O, P) {
					var metadataMap = GetOrCreateMetadataMap(O, P, false);
					if (IsUndefined(metadataMap)) return false;
					return ToBoolean(metadataMap.has(MetadataKey));
				}
				function OrdinaryGetOwnMetadata(MetadataKey, O, P) {
					var metadataMap = GetOrCreateMetadataMap(O, P, false);
					if (IsUndefined(metadataMap)) return void 0;
					return metadataMap.get(MetadataKey);
				}
				function OrdinaryDefineOwnMetadata(MetadataKey, MetadataValue, O, P) {
					GetOrCreateMetadataMap(O, P, true).set(MetadataKey, MetadataValue);
				}
				function OrdinaryOwnMetadataKeys(O, P) {
					var keys = [];
					var metadataMap = GetOrCreateMetadataMap(O, P, false);
					if (IsUndefined(metadataMap)) return keys;
					var iterator = GetIterator(metadataMap.keys());
					var k = 0;
					while (true) {
						var next = IteratorStep(iterator);
						if (!next) {
							keys.length = k;
							return keys;
						}
						var nextValue = IteratorValue(next);
						try {
							keys[k] = nextValue;
						} catch (e) {
							try {
								IteratorClose(iterator);
							} finally {
								throw e;
							}
						}
						k++;
					}
				}
				function OrdinaryDeleteMetadata(MetadataKey, O, P) {
					var metadataMap = GetOrCreateMetadataMap(O, P, false);
					if (IsUndefined(metadataMap)) return false;
					if (!metadataMap.delete(MetadataKey)) return false;
					if (metadataMap.size === 0) {
						var targetMetadata = metadata.get(O);
						if (!IsUndefined(targetMetadata)) {
							targetMetadata.delete(P);
							if (targetMetadata.size === 0) metadata.delete(targetMetadata);
						}
					}
					return true;
				}
			}
			function CreateFallbackProvider(reflect) {
				var defineMetadata = reflect.defineMetadata, hasOwnMetadata = reflect.hasOwnMetadata, getOwnMetadata = reflect.getOwnMetadata, getOwnMetadataKeys = reflect.getOwnMetadataKeys, deleteMetadata = reflect.deleteMetadata;
				var metadataOwner = new _WeakMap();
				return {
					isProviderFor: function(O, P) {
						var metadataPropertySet = metadataOwner.get(O);
						if (!IsUndefined(metadataPropertySet) && metadataPropertySet.has(P)) return true;
						if (getOwnMetadataKeys(O, P).length) {
							if (IsUndefined(metadataPropertySet)) {
								metadataPropertySet = new _Set();
								metadataOwner.set(O, metadataPropertySet);
							}
							metadataPropertySet.add(P);
							return true;
						}
						return false;
					},
					OrdinaryDefineOwnMetadata: defineMetadata,
					OrdinaryHasOwnMetadata: hasOwnMetadata,
					OrdinaryGetOwnMetadata: getOwnMetadata,
					OrdinaryOwnMetadataKeys: getOwnMetadataKeys,
					OrdinaryDeleteMetadata: deleteMetadata
				};
			}
			/**
			* Gets the metadata provider for an object. If the object has no metadata provider and this is for a create operation,
			* then this module's metadata provider is assigned to the object.
			*/
			function GetMetadataProvider(O, P, Create) {
				var registeredProvider = metadataRegistry.getProvider(O, P);
				if (!IsUndefined(registeredProvider)) return registeredProvider;
				if (Create) {
					if (metadataRegistry.setProvider(O, P, metadataProvider)) return metadataProvider;
					throw new Error("Illegal state.");
				}
			}
			function CreateMapPolyfill() {
				var cacheSentinel = {};
				var arraySentinel = [];
				var MapIterator = function() {
					function MapIterator(keys, values, selector) {
						this._index = 0;
						this._keys = keys;
						this._values = values;
						this._selector = selector;
					}
					MapIterator.prototype["@@iterator"] = function() {
						return this;
					};
					MapIterator.prototype[iteratorSymbol] = function() {
						return this;
					};
					MapIterator.prototype.next = function() {
						var index = this._index;
						if (index >= 0 && index < this._keys.length) {
							var result = this._selector(this._keys[index], this._values[index]);
							if (index + 1 >= this._keys.length) {
								this._index = -1;
								this._keys = arraySentinel;
								this._values = arraySentinel;
							} else this._index++;
							return {
								value: result,
								done: false
							};
						}
						return {
							value: void 0,
							done: true
						};
					};
					MapIterator.prototype.throw = function(error) {
						if (this._index >= 0) {
							this._index = -1;
							this._keys = arraySentinel;
							this._values = arraySentinel;
						}
						throw error;
					};
					MapIterator.prototype.return = function(value) {
						if (this._index >= 0) {
							this._index = -1;
							this._keys = arraySentinel;
							this._values = arraySentinel;
						}
						return {
							value,
							done: true
						};
					};
					return MapIterator;
				}();
				return function() {
					function Map() {
						this._keys = [];
						this._values = [];
						this._cacheKey = cacheSentinel;
						this._cacheIndex = -2;
					}
					Object.defineProperty(Map.prototype, "size", {
						get: function() {
							return this._keys.length;
						},
						enumerable: true,
						configurable: true
					});
					Map.prototype.has = function(key) {
						return this._find(key, false) >= 0;
					};
					Map.prototype.get = function(key) {
						var index = this._find(key, false);
						return index >= 0 ? this._values[index] : void 0;
					};
					Map.prototype.set = function(key, value) {
						var index = this._find(key, true);
						this._values[index] = value;
						return this;
					};
					Map.prototype.delete = function(key) {
						var index = this._find(key, false);
						if (index >= 0) {
							var size = this._keys.length;
							for (var i = index + 1; i < size; i++) {
								this._keys[i - 1] = this._keys[i];
								this._values[i - 1] = this._values[i];
							}
							this._keys.length--;
							this._values.length--;
							if (SameValueZero(key, this._cacheKey)) {
								this._cacheKey = cacheSentinel;
								this._cacheIndex = -2;
							}
							return true;
						}
						return false;
					};
					Map.prototype.clear = function() {
						this._keys.length = 0;
						this._values.length = 0;
						this._cacheKey = cacheSentinel;
						this._cacheIndex = -2;
					};
					Map.prototype.keys = function() {
						return new MapIterator(this._keys, this._values, getKey);
					};
					Map.prototype.values = function() {
						return new MapIterator(this._keys, this._values, getValue);
					};
					Map.prototype.entries = function() {
						return new MapIterator(this._keys, this._values, getEntry);
					};
					Map.prototype["@@iterator"] = function() {
						return this.entries();
					};
					Map.prototype[iteratorSymbol] = function() {
						return this.entries();
					};
					Map.prototype._find = function(key, insert) {
						if (!SameValueZero(this._cacheKey, key)) {
							this._cacheIndex = -1;
							for (var i = 0; i < this._keys.length; i++) if (SameValueZero(this._keys[i], key)) {
								this._cacheIndex = i;
								break;
							}
						}
						if (this._cacheIndex < 0 && insert) {
							this._cacheIndex = this._keys.length;
							this._keys.push(key);
							this._values.push(void 0);
						}
						return this._cacheIndex;
					};
					return Map;
				}();
				function getKey(key, _) {
					return key;
				}
				function getValue(_, value) {
					return value;
				}
				function getEntry(key, value) {
					return [key, value];
				}
			}
			function CreateSetPolyfill() {
				return function() {
					function Set() {
						this._map = new _Map();
					}
					Object.defineProperty(Set.prototype, "size", {
						get: function() {
							return this._map.size;
						},
						enumerable: true,
						configurable: true
					});
					Set.prototype.has = function(value) {
						return this._map.has(value);
					};
					Set.prototype.add = function(value) {
						return this._map.set(value, value), this;
					};
					Set.prototype.delete = function(value) {
						return this._map.delete(value);
					};
					Set.prototype.clear = function() {
						this._map.clear();
					};
					Set.prototype.keys = function() {
						return this._map.keys();
					};
					Set.prototype.values = function() {
						return this._map.keys();
					};
					Set.prototype.entries = function() {
						return this._map.entries();
					};
					Set.prototype["@@iterator"] = function() {
						return this.keys();
					};
					Set.prototype[iteratorSymbol] = function() {
						return this.keys();
					};
					return Set;
				}();
			}
			function CreateWeakMapPolyfill() {
				var UUID_SIZE = 16;
				var keys = HashMap.create();
				var rootKey = CreateUniqueKey();
				return function() {
					function WeakMap() {
						this._key = CreateUniqueKey();
					}
					WeakMap.prototype.has = function(target) {
						var table = GetOrCreateWeakMapTable(target, false);
						return table !== void 0 ? HashMap.has(table, this._key) : false;
					};
					WeakMap.prototype.get = function(target) {
						var table = GetOrCreateWeakMapTable(target, false);
						return table !== void 0 ? HashMap.get(table, this._key) : void 0;
					};
					WeakMap.prototype.set = function(target, value) {
						var table = GetOrCreateWeakMapTable(target, true);
						table[this._key] = value;
						return this;
					};
					WeakMap.prototype.delete = function(target) {
						var table = GetOrCreateWeakMapTable(target, false);
						return table !== void 0 ? delete table[this._key] : false;
					};
					WeakMap.prototype.clear = function() {
						this._key = CreateUniqueKey();
					};
					return WeakMap;
				}();
				function CreateUniqueKey() {
					var key;
					do
						key = "@@WeakMap@@" + CreateUUID();
					while (HashMap.has(keys, key));
					keys[key] = true;
					return key;
				}
				function GetOrCreateWeakMapTable(target, create) {
					if (!hasOwn.call(target, rootKey)) {
						if (!create) return void 0;
						Object.defineProperty(target, rootKey, { value: HashMap.create() });
					}
					return target[rootKey];
				}
				function FillRandomBytes(buffer, size) {
					for (var i = 0; i < size; ++i) buffer[i] = Math.random() * 255 | 0;
					return buffer;
				}
				function GenRandomBytes(size) {
					if (typeof Uint8Array === "function") {
						var array = new Uint8Array(size);
						if (typeof crypto !== "undefined") crypto.getRandomValues(array);
						else if (typeof msCrypto !== "undefined") msCrypto.getRandomValues(array);
						else FillRandomBytes(array, size);
						return array;
					}
					return FillRandomBytes(new Array(size), size);
				}
				function CreateUUID() {
					var data = GenRandomBytes(UUID_SIZE);
					data[6] = data[6] & 79 | 64;
					data[8] = data[8] & 191 | 128;
					var result = "";
					for (var offset = 0; offset < UUID_SIZE; ++offset) {
						var byte = data[offset];
						if (offset === 4 || offset === 6 || offset === 8) result += "-";
						if (byte < 16) result += "0";
						result += byte.toString(16).toLowerCase();
					}
					return result;
				}
			}
			function MakeDictionary(obj) {
				obj.__ = void 0;
				delete obj.__;
				return obj;
			}
		});
	})(Reflect || (Reflect = {}));
}));
//#endregion
//#region node_modules/@microsoft/teams.apps/dist/types/plugin/decorators/plugin.js
var require_plugin$2 = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.PLUGIN_METADATA_KEY = void 0;
	exports.Plugin = Plugin;
	require_Reflect();
	exports.PLUGIN_METADATA_KEY = "teams:plugin";
	/**
	* turn any class into a plugin via
	* `@Plugin({ ... })`
	*/
	function Plugin(metadata = {}) {
		return (Base) => {
			const name = metadata.name || Base.name;
			const version = metadata.version || "0.0.0";
			Reflect.defineMetadata(exports.PLUGIN_METADATA_KEY, {
				name,
				version,
				description: metadata.description
			}, Base);
			return Base;
		};
	}
}));
//#endregion
//#region node_modules/@microsoft/teams.apps/dist/types/plugin/decorators/dependency.js
var require_dependency = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.PLUGIN_DEPENDENCIES_METADATA_KEY = void 0;
	exports.Dependency = Dependency;
	exports.Logger = Logger;
	exports.Storage = Storage;
	exports.HttpServer = HttpServer;
	require_Reflect();
	const plugin_1 = require_plugin$2();
	exports.PLUGIN_DEPENDENCIES_METADATA_KEY = "teams:plugin:dependencies";
	/**
	* add plugin dependencies via
	* `@Dependency()`
	*/
	function Dependency(options = {}) {
		const name = options.name;
		const optional = options.optional || false;
		return (target, propertyKey) => {
			if (typeof propertyKey === "string") {
				const TargetType = target.constructor;
				const FieldType = Reflect.getMetadata("design:type", target, propertyKey);
				let fieldTypeKey = name || FieldType.name;
				if (Reflect.hasMetadata(plugin_1.PLUGIN_METADATA_KEY, FieldType)) fieldTypeKey = Reflect.getMetadata(plugin_1.PLUGIN_METADATA_KEY, FieldType).name;
				const targetFieldsMetadata = Reflect.getOwnMetadata(exports.PLUGIN_DEPENDENCIES_METADATA_KEY, TargetType) || [];
				targetFieldsMetadata.push({
					key: propertyKey,
					type: fieldTypeKey,
					optional
				});
				Reflect.defineMetadata(exports.PLUGIN_DEPENDENCIES_METADATA_KEY, targetFieldsMetadata, TargetType);
			}
		};
	}
	/**
	* inject the `App` `ILogger` instance
	*/
	function Logger() {
		return Dependency({ name: "ILogger" });
	}
	/**
	* inject the `App` `IStorage` instance
	*/
	function Storage() {
		return Dependency({ name: "IStorage" });
	}
	/**
	* inject the `App` `IHttpServer` instance
	*/
	function HttpServer() {
		return Dependency({ name: "IHttpServer" });
	}
}));
//#endregion
//#region node_modules/@microsoft/teams.apps/dist/types/plugin/decorators/event.js
var require_event$1 = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.PLUGIN_EVENTS_METADATA_KEY = void 0;
	exports.Event = Event;
	require_Reflect();
	exports.PLUGIN_EVENTS_METADATA_KEY = "teams:plugin:events";
	/**
	* add an event emitter to your plugin
	* via `@Event(...)`
	*/
	function Event(name) {
		return (target, propertyKey) => {
			if (typeof propertyKey === "string") {
				const TargetType = target.constructor;
				const targetEventsMetadata = Reflect.getOwnMetadata(exports.PLUGIN_EVENTS_METADATA_KEY, TargetType) || [];
				targetEventsMetadata.push({
					key: propertyKey,
					name
				});
				Reflect.defineMetadata(exports.PLUGIN_EVENTS_METADATA_KEY, targetEventsMetadata, TargetType);
			}
		};
	}
}));
//#endregion
//#region node_modules/@microsoft/teams.apps/dist/types/plugin/decorators/index.js
var require_decorators = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.Event = exports.HttpServer = exports.Storage = exports.Logger = exports.Dependency = exports.Plugin = void 0;
	var plugin_1 = require_plugin$2();
	Object.defineProperty(exports, "Plugin", {
		enumerable: true,
		get: function() {
			return plugin_1.Plugin;
		}
	});
	var dependency_1 = require_dependency();
	Object.defineProperty(exports, "Dependency", {
		enumerable: true,
		get: function() {
			return dependency_1.Dependency;
		}
	});
	Object.defineProperty(exports, "Logger", {
		enumerable: true,
		get: function() {
			return dependency_1.Logger;
		}
	});
	Object.defineProperty(exports, "Storage", {
		enumerable: true,
		get: function() {
			return dependency_1.Storage;
		}
	});
	Object.defineProperty(exports, "HttpServer", {
		enumerable: true,
		get: function() {
			return dependency_1.HttpServer;
		}
	});
	var event_1 = require_event$1();
	Object.defineProperty(exports, "Event", {
		enumerable: true,
		get: function() {
			return event_1.Event;
		}
	});
}));
//#endregion
//#region node_modules/@microsoft/teams.apps/dist/types/plugin/index.js
var require_plugin$1 = /* @__PURE__ */ __commonJSMin(((exports) => {
	var __createBinding = exports && exports.__createBinding || (Object.create ? (function(o, m, k, k2) {
		if (k2 === void 0) k2 = k;
		var desc = Object.getOwnPropertyDescriptor(m, k);
		if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) desc = {
			enumerable: true,
			get: function() {
				return m[k];
			}
		};
		Object.defineProperty(o, k2, desc);
	}) : (function(o, m, k, k2) {
		if (k2 === void 0) k2 = k;
		o[k2] = m[k];
	}));
	var __exportStar = exports && exports.__exportStar || function(m, exports$13) {
		for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports$13, p)) __createBinding(exports$13, m, p);
	};
	Object.defineProperty(exports, "__esModule", { value: true });
	__exportStar(require_plugin$3(), exports);
	__exportStar(require_plugin_activity_event(), exports);
	__exportStar(require_plugin_activity_sent_event(), exports);
	__exportStar(require_plugin_activity_response_event(), exports);
	__exportStar(require_plugin_error_event(), exports);
	__exportStar(require_plugin_start_event(), exports);
	__exportStar(require_sender(), exports);
	__exportStar(require_decorators(), exports);
}));
//#endregion
//#region node_modules/@microsoft/teams.apps/dist/types/prefixed.js
var require_prefixed = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
}));
//#endregion
//#region node_modules/@microsoft/teams.apps/dist/types/route-handler.js
var require_route_handler = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
}));
//#endregion
//#region node_modules/@microsoft/teams.apps/dist/types/streamer.js
var require_streamer = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.StreamCancelledError = void 0;
	/**
	* Raised when Teams cancels a stream (403) or when a stream operation is attempted after cancellation.
	*/
	var StreamCancelledError = class extends Error {
		constructor(message) {
			super(message ?? "stream canceled");
			this.name = "StreamCancelledError";
		}
	};
	exports.StreamCancelledError = StreamCancelledError;
}));
//#endregion
//#region node_modules/@microsoft/teams.apps/dist/types/suffixed.js
var require_suffixed = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
}));
//#endregion
//#region node_modules/@microsoft/teams.apps/dist/types/union-to-intersection.js
var require_union_to_intersection = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
}));
//#endregion
//#region node_modules/@microsoft/teams.apps/dist/types/index.js
var require_types = /* @__PURE__ */ __commonJSMin(((exports) => {
	var __createBinding = exports && exports.__createBinding || (Object.create ? (function(o, m, k, k2) {
		if (k2 === void 0) k2 = k;
		var desc = Object.getOwnPropertyDescriptor(m, k);
		if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) desc = {
			enumerable: true,
			get: function() {
				return m[k];
			}
		};
		Object.defineProperty(o, k2, desc);
	}) : (function(o, m, k, k2) {
		if (k2 === void 0) k2 = k;
		o[k2] = m[k];
	}));
	var __exportStar = exports && exports.__exportStar || function(m, exports$12) {
		for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports$12, p)) __createBinding(exports$12, m, p);
	};
	Object.defineProperty(exports, "__esModule", { value: true });
	__exportStar(require_app_events$1(), exports);
	__exportStar(require_event_handler(), exports);
	__exportStar(require_plugin$1(), exports);
	__exportStar(require_prefixed(), exports);
	__exportStar(require_route_handler(), exports);
	__exportStar(require_streamer(), exports);
	__exportStar(require_suffixed(), exports);
	__exportStar(require_union_to_intersection(), exports);
}));
//#endregion
//#region node_modules/@microsoft/teams.apps/dist/utils/asserts.js
var require_asserts = /* @__PURE__ */ __commonJSMin(((exports) => {
	var __importDefault = exports && exports.__importDefault || function(mod) {
		return mod && mod.__esModule ? mod : { "default": mod };
	};
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.assertNever = void 0;
	const assert_1 = __importDefault(__require("assert"));
	const assertNever = (value, message) => {
		(0, assert_1.default)(false, message ?? `Unexpected value: ${value}`);
	};
	exports.assertNever = assertNever;
}));
//#endregion
//#region node_modules/@microsoft/teams.apps/dist/utils/promises/retry.js
var require_retry = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.retry = retry;
	const types_1 = require_types();
	async function retry(factory, options) {
		const max = options?.max ?? 5;
		const delay = options?.delay ?? 500;
		const log = options?.logger?.child("retry");
		try {
			return await factory();
		} catch (err) {
			if (err instanceof types_1.StreamCancelledError || err instanceof Error && err.name === "StreamCancelledError") throw err;
			if (max > 1) {
				log?.debug(`delaying ${delay}ms...`);
				await new Promise((resolve) => setTimeout(resolve, delay));
				log?.debug("retrying...");
				return retry(factory, {
					max: max - 1,
					delay: delay * 2,
					logger: options?.logger
				});
			}
			log?.error(err);
			throw err;
		}
	}
}));
//#endregion
//#region node_modules/@microsoft/teams.apps/dist/utils/promises/index.js
var require_promises = /* @__PURE__ */ __commonJSMin(((exports) => {
	var __createBinding = exports && exports.__createBinding || (Object.create ? (function(o, m, k, k2) {
		if (k2 === void 0) k2 = k;
		var desc = Object.getOwnPropertyDescriptor(m, k);
		if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) desc = {
			enumerable: true,
			get: function() {
				return m[k];
			}
		};
		Object.defineProperty(o, k2, desc);
	}) : (function(o, m, k, k2) {
		if (k2 === void 0) k2 = k;
		o[k2] = m[k];
	}));
	var __exportStar = exports && exports.__exportStar || function(m, exports$11) {
		for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports$11, p)) __createBinding(exports$11, m, p);
	};
	Object.defineProperty(exports, "__esModule", { value: true });
	__exportStar(require_retry(), exports);
}));
//#endregion
//#region node_modules/@microsoft/teams.apps/dist/utils/function-context.js
var require_function_context = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.getConversationIdResolver = getConversationIdResolver;
	function getConversationIdResolver(app, log, context) {
		let state;
		const { userId, userName, tenantId } = context;
		const conversationId = context.chatId ?? context.channelId;
		return async () => {
			if (state) return state.id;
			if (!conversationId) try {
				state = { id: (await app.api.conversations.create({
					members: [{
						id: userId,
						role: "user",
						name: userName
					}],
					tenantId
				})).id };
			} catch {
				state = { id: void 0 };
				log.error("failed to create conversation with user", { userId });
			}
			else {
				try {
					state = { id: !await app.api.conversations.members(conversationId).getById(userId) ? void 0 : conversationId };
				} catch {
					state = { id: void 0 };
				}
				if (!state.id) log.warn("either the bot or the user are not in this conversation", {
					conversationId,
					userId
				});
			}
			return state.id;
		};
	}
}));
//#endregion
//#region node_modules/@microsoft/teams.apps/dist/utils/thread.js
var require_thread = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.toThreadedConversationId = toThreadedConversationId;
	/**
	* Constructs a threaded conversation ID by appending `;messageid={messageId}`
	* to the conversation ID. This is the format APX uses to route messages
	* to a specific thread.
	*
	* @param conversationId the conversation to thread into (e.g. `19:abc@thread.skype`)
	* @param messageId the thread root message ID (must be a non-zero numeric string)
	* @returns the threaded conversation ID (e.g. `19:abc@thread.skype;messageid=123`)
	*/
	function toThreadedConversationId(conversationId, messageId) {
		if (!conversationId) throw new Error("conversationId must be a non-empty string");
		if (!messageId || !/^\d+$/.test(messageId) || messageId === "0") throw new Error(`Invalid messageId "${messageId}": must be a non-zero numeric value`);
		return `${conversationId.split(";")[0]};messageid=${messageId}`;
	}
}));
//#endregion
//#region node_modules/@microsoft/teams.apps/dist/utils/index.js
var require_utils = /* @__PURE__ */ __commonJSMin(((exports) => {
	var __createBinding = exports && exports.__createBinding || (Object.create ? (function(o, m, k, k2) {
		if (k2 === void 0) k2 = k;
		var desc = Object.getOwnPropertyDescriptor(m, k);
		if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) desc = {
			enumerable: true,
			get: function() {
				return m[k];
			}
		};
		Object.defineProperty(o, k2, desc);
	}) : (function(o, m, k, k2) {
		if (k2 === void 0) k2 = k;
		o[k2] = m[k];
	}));
	var __setModuleDefault = exports && exports.__setModuleDefault || (Object.create ? (function(o, v) {
		Object.defineProperty(o, "default", {
			enumerable: true,
			value: v
		});
	}) : function(o, v) {
		o["default"] = v;
	});
	var __importStar = exports && exports.__importStar || (function() {
		var ownKeys = function(o) {
			ownKeys = Object.getOwnPropertyNames || function(o) {
				var ar = [];
				for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
				return ar;
			};
			return ownKeys(o);
		};
		return function(mod) {
			if (mod && mod.__esModule) return mod;
			var result = {};
			if (mod != null) {
				for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
			}
			__setModuleDefault(result, mod);
			return result;
		};
	})();
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.toThreadedConversationId = exports.functionContext = exports.promises = exports.asserts = void 0;
	exports.asserts = __importStar(require_asserts());
	exports.promises = __importStar(require_promises());
	exports.functionContext = __importStar(require_function_context());
	var thread_1 = require_thread();
	Object.defineProperty(exports, "toThreadedConversationId", {
		enumerable: true,
		get: function() {
			return thread_1.toThreadedConversationId;
		}
	});
}));
//#endregion
//#region node_modules/@microsoft/teams.apps/dist/http/http-stream.js
var require_http_stream = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.HttpStream = void 0;
	const teams_api_1 = require_dist$3();
	const teams_common_1 = require_dist$2();
	const types_1 = require_types();
	const utils_1 = require_utils();
	/**
	* HTTP-based streaming implementation for Microsoft Teams activities.
	*
	* Allows sending typing indicators and messages in chunks to Teams.
	* Queues incoming activities and flushes them periodically to avoid
	* rate limits.
	*
	* Flow:
	* 1. `emit()` adds activities to the queue and starts a flush if none scheduled.
	* 2. `_flush()` starts by cancelling any pending flush, then processes up to 10 queued activities under a lock.
	* 3. Informative typing updates are sent immediately.
	* 4. Message text is combined and sent as a typing activity.
	* 5. `_flush()` schedules another flush if more items remain in queue.
	* 6. `close()` waits for the queue to empty and sends the final message activity.
	*/
	var HttpStream = class {
		events = new teams_common_1.EventEmitter();
		client;
		ref;
		index = 0;
		id;
		text = "";
		attachments = [];
		channelData = {};
		entities = [];
		queue = [];
		_result;
		_timeout;
		_logger;
		_flushing = false;
		_canceled = false;
		_totalTimeout = 3e4;
		/**
		* Whether the stream has been canceled.
		* For example when the user pressed the Stop button or the 2-minute timeout has exceeded.
		*/
		get canceled() {
			return this._canceled;
		}
		constructor(client, ref, logger) {
			this.client = client;
			this.ref = ref;
			this._logger = logger?.child("stream") || new teams_common_1.ConsoleLogger("@teams/http-stream");
		}
		/**
		* Emit a new activity or text to the stream.
		* @param activity Activity object or string message.
		*/
		emit(activity) {
			if (this._canceled) throw new types_1.StreamCancelledError();
			if (typeof activity === "string") activity = {
				type: "message",
				text: activity
			};
			this.queue.push(activity);
			if (!this._timeout) this.flush();
		}
		/**
		* Send a typing/status update without adding to the main text.
		* @param text Status text (ex. "Thinking...")
		*/
		update(text) {
			this.emit({
				type: "typing",
				text,
				channelData: { streamType: "informative" }
			});
		}
		/**
		* Close the stream by sending the final message.
		* Waits for all queued activities to flush.
		*/
		async close() {
			if (!this.index && !this.queue.length && !this._flushing) {
				this._logger.debug("closed with no content");
				return;
			}
			if (this._result) {
				this._logger.debug("already closed");
				return this._result;
			}
			if (this._canceled) {
				this._logger.debug("stream canceled, nothing to close");
				return;
			}
			const start = Date.now();
			while ((this.queue.length || !this.id) && !this._canceled) {
				if (Date.now() - start > this._totalTimeout) {
					this._logger.warn("Timeout while waiting for id and queue to flush");
					return;
				}
				this._logger.debug("waiting for id to be set or queue to be empty");
				await new Promise((resolve) => setTimeout(resolve, 100));
			}
			if (this._canceled) {
				this._logger.debug("stream canceled, nothing to close");
				return;
			}
			if (!this.id) {
				this._logger.warn("no stream id set, cannot close stream");
				return;
			}
			if (this.text === "" && !this.attachments.length) {
				this._logger.warn("no text or attachments to send, cannot close stream");
				return;
			}
			const activity = new teams_api_1.MessageActivity(this.text).withId(this.id).addAttachments(...this.attachments).addEntities(...this.entities).addStreamFinal().withChannelData(this.channelData);
			const res = await utils_1.promises.retry(() => this.send(activity), { logger: this._logger });
			this.events.emit("close", res);
			this.index = 0;
			this.id = void 0;
			this.text = "";
			this.attachments = [];
			this.channelData = {};
			this.entities = [];
			this._result = res;
			this._logger.debug(res);
			return res;
		}
		/**
		* Flush queued activities.
		* Processes up to 10 items at a time.
		*/
		async flush() {
			if (!this.queue.length || this._flushing) return;
			this._flushing = true;
			try {
				if (this._timeout) {
					clearTimeout(this._timeout);
					this._timeout = void 0;
				}
				const informativeUpdates = [];
				const startLength = this.queue.length;
				while (this.queue.length) {
					const activity = this.queue.shift();
					if (!activity) continue;
					if (activity.type === "message") {
						if (activity.text) this.text += activity.text;
						if (activity.attachments) this.attachments = [...this.attachments || [], ...activity.attachments];
						if (activity.entities) this.entities = [...this.entities || [], ...activity.entities];
					}
					if (activity.type === "typing") {
						if (activity.channelData?.streamType === "informative" && this.text === "") informativeUpdates.push(activity);
					}
					if (activity.channelData) this.channelData = {
						...this.channelData,
						...activity.channelData
					};
				}
				if (startLength === 0) return;
				for (const informativeUpdate of informativeUpdates) {
					const activity = new teams_api_1.TypingActivity().withText(informativeUpdate.text || "").withChannelData({ streamType: "informative" });
					await this.pushStreamChunk(activity);
				}
				if (this.text) {
					const activity = new teams_api_1.TypingActivity().withText(this.text);
					await this.pushStreamChunk(activity);
				}
				if (this.queue.length) this._timeout = setTimeout(this.flush.bind(this), 500);
			} catch (err) {
				if (!(err instanceof types_1.StreamCancelledError)) this._logger.error(err, "flush failed");
			} finally {
				this._flushing = false;
			}
		}
		/**
		* Push a new chunk to the stream.
		* @param activity TypingActivity to send.
		*/
		async pushStreamChunk(activity) {
			if (this.id) activity.id = this.id;
			activity.addStreamUpdate(this.index + 1);
			const res = await utils_1.promises.retry(() => this.send(activity), { logger: this._logger });
			this.events.emit("chunk", res);
			this.index++;
			if (!this.id) this.id = res.id;
		}
		/**
		* Send or update a streaming activity
		* @param activity ActivityParams to send.
		*/
		async send(activity) {
			if (this._canceled) throw new types_1.StreamCancelledError();
			activity = {
				...activity,
				from: this.ref.bot,
				conversation: this.ref.conversation
			};
			try {
				if (activity.id && !(activity.entities?.some((e) => e.type === "streaminfo") || false)) {
					const res = await this.client.conversations.activities(this.ref.conversation.id).update(activity.id, activity);
					return {
						...activity,
						...res
					};
				}
				const res = await this.client.conversations.activities(this.ref.conversation.id).create(activity);
				return {
					...activity,
					...res
				};
			} catch (err) {
				if (err?.response?.status === 403) {
					this._canceled = true;
					this._logger.debug("stream canceled by Teams (403)");
					throw new types_1.StreamCancelledError();
				}
				throw err;
			}
		}
	};
	exports.HttpStream = HttpStream;
}));
//#endregion
//#region node_modules/@microsoft/teams.apps/dist/activity-sender.js
var require_activity_sender = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.ActivitySender = void 0;
	const teams_api_1 = require_dist$3();
	const http_stream_1 = require_http_stream();
	/**
	* Handles sending activities to the Bot Framework
	* Separate from transport concerns (HTTP, WebSocket, etc.)
	*/
	var ActivitySender = class {
		client;
		logger;
		constructor(client, logger) {
			this.client = client;
			this.logger = logger;
		}
		async send(activity, ref) {
			const api = new teams_api_1.Client(ref.serviceUrl, this.client);
			activity = {
				...activity,
				from: ref.bot,
				conversation: ref.conversation
			};
			const isTargeted = activity.recipient?.isTargeted === true;
			if (activity.id) {
				const res = isTargeted ? await api.conversations.activities(ref.conversation.id).updateTargeted(activity.id, activity) : await api.conversations.activities(ref.conversation.id).update(activity.id, activity);
				return {
					...activity,
					...res
				};
			}
			const res = isTargeted ? await api.conversations.activities(ref.conversation.id).createTargeted(activity) : await api.conversations.activities(ref.conversation.id).create(activity);
			return {
				...activity,
				...res
			};
		}
		createStream(ref) {
			const api = new teams_api_1.Client(ref.serviceUrl, this.client);
			return new http_stream_1.HttpStream(api, ref, this.logger);
		}
	};
	exports.ActivitySender = ActivitySender;
}));
//#endregion
//#region node_modules/@microsoft/teams.graph/dist/index.js
var require_dist$1 = /* @__PURE__ */ __commonJSMin(((exports) => {
	var l = require_http$2(), w = require_lib$1();
	function _interopDefault(e) {
		return e && e.__esModule ? e : { default: e };
	}
	function _interopNamespace(e) {
		if (e && e.__esModule) return e;
		var n = Object.create(null);
		if (e) Object.keys(e).forEach(function(k) {
			if (k !== "default") {
				var d = Object.getOwnPropertyDescriptor(e, k);
				Object.defineProperty(n, k, d.get ? d : {
					enumerable: true,
					get: function() {
						return e[k];
					}
				});
			}
		});
		n.default = e;
		return Object.freeze(n);
	}
	var l__namespace = /* @__PURE__ */ _interopNamespace(l);
	var w__default = /* @__PURE__ */ _interopDefault(w);
	function R(a, t, e) {
		let s = {};
		for (let r of t.query ?? []) s[r] = e[r];
		for (let r of t.path ?? []) a = a.replace(`{${r}}`, e[r]);
		return `${a}${w__default.default.stringify(s, {
			addQueryPrefix: true,
			arrayFormat: "comma"
		})}`;
	}
	function y(a, t, e) {
		let s = (a.header ?? []).reduce((r, n) => (t[n] && (r[n] = t[n]), r), {});
		return Object.keys(s).length === 0 ? e : {
			...e,
			headers: {
				...e?.headers,
				...s
			}
		};
	}
	var u = class extends Error {
		statusCode;
		code;
		body;
		source;
		constructor(t, e, s, r, n) {
			let i = e && typeof e == "object" && "error" in e ? e.error : void 0, c = i?.message ? `Graph ${s.toUpperCase()} ${r} failed (${t}): ${i.message}` : `Graph ${s.toUpperCase()} ${r} failed with status ${t}`;
			super(c), this.name = "GraphError", this.statusCode = t, this.code = i?.code, Object.defineProperty(this, "body", {
				value: e,
				enumerable: false,
				writable: true,
				configurable: true
			}), n !== void 0 && Object.defineProperty(this, "source", {
				value: n,
				enumerable: false,
				writable: true,
				configurable: true
			});
		}
	}, O = "https://graph.microsoft.com", C = class {
		baseUrlRoot;
		_http;
		betaHttp;
		get http() {
			return this._http;
		}
		constructor(t, e) {
			this.baseUrlRoot = e?.baseUrlRoot ?? t?.baseUrlRoot ?? O, t ? "request" in t ? this._http = t.clone({
				baseUrl: `${this.baseUrlRoot}/v1.0`,
				headers: {
					"Content-Type": "application/json",
					"User-Agent": "teams.ts[graph]/0.0.0"
				}
			}) : this._http = new l__namespace.Client({
				...t,
				baseUrl: `${this.baseUrlRoot}/v1.0`,
				headers: {
					"Content-Type": "application/json",
					"User-Agent": "teams.ts[graph]/0.0.0",
					...t.headers
				}
			}) : this._http = new l__namespace.Client({
				baseUrl: `${this.baseUrlRoot}/v1.0`,
				headers: {
					"Content-Type": "application/json",
					"User-Agent": "teams.ts[graph]/0.0.0"
				}
			});
		}
		async call(t, ...e) {
			let s = e[e.length - 1], r = e.length > t.length && s && typeof s == "object" && "requestConfig" in s, n = r ? e.slice(0, -1) : e, i = r ? s : void 0, { ver: c = "v1.0", method: p, path: _, paramDefs: d = {}, params: f = {}, body: U } = t(...n), h = R(_, d, f), g = y(d, f, i?.requestConfig), m = this.getHttpClient(c);
			try {
				switch (p) {
					case "delete":
					case "get": return (await m[p](h, g)).data;
					case "patch":
					case "post":
					case "put": return (await m[p](h, U, g)).data;
					default: throw new Error(`Unsupported HTTP method: ${p}`);
				}
			} catch (o) {
				if (o && typeof o == "object" && "isAxiosError" in o && "response" in o && o.response) {
					let { response: b } = o;
					throw new u(b.status, b.data, p, h, o);
				}
				throw o;
			}
		}
		getHttpClient(t) {
			return t === "v1.0" ? this._http : (this.betaHttp = this.betaHttp ?? this._http.clone({ baseUrl: `${this.baseUrlRoot}/beta` }), this.betaHttp);
		}
	};
	exports.Client = C;
	exports.GraphError = u;
}));
//#endregion
//#region node_modules/@microsoft/teams.apps/dist/api.js
var require_api = /* @__PURE__ */ __commonJSMin(((exports) => {
	var __createBinding = exports && exports.__createBinding || (Object.create ? (function(o, m, k, k2) {
		if (k2 === void 0) k2 = k;
		var desc = Object.getOwnPropertyDescriptor(m, k);
		if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) desc = {
			enumerable: true,
			get: function() {
				return m[k];
			}
		};
		Object.defineProperty(o, k2, desc);
	}) : (function(o, m, k, k2) {
		if (k2 === void 0) k2 = k;
		o[k2] = m[k];
	}));
	var __setModuleDefault = exports && exports.__setModuleDefault || (Object.create ? (function(o, v) {
		Object.defineProperty(o, "default", {
			enumerable: true,
			value: v
		});
	}) : function(o, v) {
		o["default"] = v;
	});
	var __importStar = exports && exports.__importStar || (function() {
		var ownKeys = function(o) {
			ownKeys = Object.getOwnPropertyNames || function(o) {
				var ar = [];
				for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
				return ar;
			};
			return ownKeys(o);
		};
		return function(mod) {
			if (mod && mod.__esModule) return mod;
			var result = {};
			if (mod != null) {
				for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
			}
			__setModuleDefault(result, mod);
			return result;
		};
	})();
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.GraphClient = exports.ApiClient = void 0;
	const api = __importStar(require_dist$3());
	const graph = __importStar(require_dist$1());
	exports.ApiClient = api.Client;
	exports.GraphClient = graph.Client;
}));
//#endregion
//#region node_modules/@microsoft/teams.apps/dist/middleware/auth/jwt-validator.js
var require_jwt_validator = /* @__PURE__ */ __commonJSMin(((exports) => {
	var __importDefault = exports && exports.__importDefault || function(mod) {
		return mod && mod.__esModule ? mod : { "default": mod };
	};
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.createEntraTokenValidator = exports.JwtValidator = void 0;
	const jsonwebtoken_1 = __importDefault(require_jsonwebtoken());
	const jwks_rsa_1 = __importDefault(require_src());
	const teams_common_1 = require_dist$2();
	const asserts_1 = require_asserts();
	const DEFAULTS = { clockTolerance: 300 };
	var JwtValidator = class {
		options;
		logger;
		jwksCache = /* @__PURE__ */ new Map();
		constructor(options, logger) {
			this.options = options;
			this.logger = logger?.child("jwt-validator") ?? new teams_common_1.ConsoleLogger("jwt-validator");
		}
		/**
		* Validates a JWT token using the configured options
		*/
		async validateAccessToken(rawToken, overrideOptions) {
			if (!rawToken) throw new Error("No token provided");
			return new Promise((resolve) => {
				const verifyOptions = {
					audience: [
						this.options.clientId,
						`api://botid-${this.options.clientId}`,
						`api://${this.options.clientId}`,
						...this.options.audience ?? []
					],
					issuer: void 0,
					ignoreExpiration: false,
					algorithms: ["RS256"],
					clockTolerance: this.options.clockTolerance ?? DEFAULTS.clockTolerance
				};
				this.logger?.debug("Validating JWT token with options:", {
					audience: verifyOptions.audience,
					clockTolerance: verifyOptions.clockTolerance,
					algorithms: verifyOptions.algorithms
				});
				jsonwebtoken_1.default.verify(rawToken, this.getSigningKey.bind(this), verifyOptions, (err, decoded) => {
					if (err) {
						this.logger?.error("JWT verification failed:", err);
						resolve(null);
						return;
					}
					if (!decoded || typeof decoded !== "object") {
						this.logger?.error("Decoded token is not a valid object:", decoded);
						resolve(null);
						return;
					}
					this.logger?.debug("JWT verification succeeded");
					const payload = decoded;
					try {
						this.performCustomValidations(payload, overrideOptions);
						this.logger?.debug("Custom validations passed for token");
						resolve(payload);
					} catch (validationError) {
						this.logger?.error("Custom validation failed:", validationError);
						resolve(null);
					}
				});
			});
		}
		getJwksClient() {
			switch (this.options.jwksUriOptions.type) {
				case "tenantId": {
					const cachedClient = this.jwksCache.get(`${this.options.tenantId}`);
					if (cachedClient) {
						this.logger?.debug(`Using cached JWKS client for tenant ID: ${this.options.tenantId}`);
						return cachedClient;
					}
					const loginEndpoint = this.options.loginEndpoint ?? "https://login.microsoftonline.com";
					this.jwksCache.set(`${this.options.tenantId}`, (0, jwks_rsa_1.default)({ jwksUri: `${loginEndpoint}/${this.options.tenantId}/discovery/v2.0/keys` }));
					return this.jwksCache.get(`${this.options.tenantId}`);
				}
				case "uri": {
					const cachedClient = this.jwksCache.get(this.options.jwksUriOptions.uri);
					if (cachedClient) {
						this.logger?.debug(`Using cached JWKS client for URI: ${this.options.jwksUriOptions.uri}`);
						return cachedClient;
					}
					this.jwksCache.set(this.options.jwksUriOptions.uri, (0, jwks_rsa_1.default)({ jwksUri: this.options.jwksUriOptions.uri }));
					return this.jwksCache.get(this.options.jwksUriOptions.uri);
				}
				default: (0, asserts_1.assertNever)(this.options.jwksUriOptions, `Unknown JWKS URI options type: ${this.options.jwksUriOptions}`);
			}
		}
		getSigningKey(header, callback) {
			this.getJwksClient()?.getSigningKey(header.kid, (err, key) => {
				if (err) {
					this.logger?.error("Failed to get signing key:", err);
					callback(err, void 0);
					return;
				}
				const signingKey = key?.getPublicKey();
				callback(null, signingKey);
			});
		}
		validateIssuer(iss) {
			const validateIssuer = this.options.validateIssuer;
			if (!validateIssuer) return;
			if ("allowedIssuer" in validateIssuer) {
				if (!validateIssuer.allowedIssuer) return;
				if (!iss) throw new Error("Token missing issuer claim");
				if (iss !== validateIssuer.allowedIssuer) throw new Error(`Token issuer '${iss}' does not match allowed issuer '${validateIssuer.allowedIssuer}'`);
			}
			if ("allowedTenantIds" in validateIssuer) {
				if (!validateIssuer.allowedTenantIds?.length) return;
				if (!iss) throw new Error("Token missing issuer claim");
				if (!this.options.tenantId) throw new Error("Tenant ID is required when allowedTenantIds is configured");
				const isMultiTenant = [
					"common",
					"organizations",
					"consumers"
				].includes(this.options.tenantId);
				const allowedTenantIds = [];
				if (isMultiTenant) {
					for (const tenantId of validateIssuer.allowedTenantIds) if (![
						"common",
						"organizations",
						"consumers"
					].includes(tenantId)) allowedTenantIds.push(tenantId);
				} else allowedTenantIds.push(this.options.tenantId);
				if (allowedTenantIds.length === 0) return;
				const loginEndpoint = this.options.loginEndpoint ?? "https://login.microsoftonline.com";
				if (!allowedTenantIds.some((tenantId) => iss.startsWith(`${loginEndpoint}/${tenantId}/`))) throw new Error(`Token issuer '${iss}' not in allowed tenant IDs: ${allowedTenantIds.join(", ")}`);
			}
		}
		validateScope(scp, overrideValidateScope) {
			const validateScope = overrideValidateScope || this.options.validateScope;
			if (validateScope) {
				if (!new Set((scp ?? "").split(" ")).has(validateScope.requiredScope)) throw new Error(`Token missing required scope: ${validateScope.requiredScope}`);
			}
		}
		validateServiceUrl(serviceUrl, overrideValidateServiceUrl) {
			const validateServiceUrl = overrideValidateServiceUrl || this.options.validateServiceUrl;
			if (validateServiceUrl) {
				if (!serviceUrl) throw new Error("Token missing serviceurl claim");
				const normalizedTokenUrl = serviceUrl.replace(/\/$/, "").toLowerCase();
				const normalizedExpectedUrl = validateServiceUrl.expectedServiceUrl.replace(/\/$/, "").toLowerCase();
				if (normalizedTokenUrl !== normalizedExpectedUrl) throw new Error(`Service URL mismatch. Token: ${normalizedTokenUrl}, Expected: ${normalizedExpectedUrl}`);
			}
		}
		performCustomValidations(payload, overrideOptions) {
			this.validateIssuer(payload.iss);
			this.validateScope(payload.scp, overrideOptions?.validateScope);
			this.validateServiceUrl(payload.serviceurl, overrideOptions?.validateServiceUrl);
		}
	};
	exports.JwtValidator = JwtValidator;
	const createEntraTokenValidator = (tenantId, clientId, options) => {
		return new JwtValidator({
			clientId,
			tenantId,
			loginEndpoint: options?.loginEndpoint,
			audience: options?.applicationIdUri ? [options.applicationIdUri] : void 0,
			validateIssuer: { allowedTenantIds: options?.allowedTenantIds },
			validateScope: options?.requiredScope ? { requiredScope: options.requiredScope } : void 0,
			jwksUriOptions: { type: "tenantId" }
		}, options?.logger);
	};
	exports.createEntraTokenValidator = createEntraTokenValidator;
}));
//#endregion
//#region node_modules/@microsoft/teams.apps/dist/middleware/auth/remote-function-validator.js
var require_remote_function_validator = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.RemoteFunctionValidator = void 0;
	const jwt_validator_1 = require_jwt_validator();
	exports.RemoteFunctionValidator = class RemoteFunctionValidator {
		entraTokenValidator;
		logger;
		constructor(entraTokenValidator, logger) {
			this.entraTokenValidator = entraTokenValidator;
			this.logger = logger;
		}
		/**
		* Create a remote function validator for Entra tokens
		*/
		static create(tenantId, clientId, logger, options) {
			return new RemoteFunctionValidator(new jwt_validator_1.JwtValidator({
				clientId,
				tenantId,
				validateIssuer: { allowedTenantIds: options?.allowedTenantIds },
				validateScope: options?.requiredScope ? { requiredScope: options.requiredScope } : void 0,
				jwksUriOptions: { type: "tenantId" }
			}, logger), logger);
		}
		async check(headers) {
			const h = (key) => {
				const v = headers[key];
				return Array.isArray(v) ? v[0] : v;
			};
			const appSessionId = h("x-teams-app-session-id");
			const pageId = h("x-teams-page-id");
			const authorization = h("authorization")?.split(" ");
			const authToken = authorization?.length === 2 && authorization[0].toLowerCase() === "bearer" ? authorization[1] : "";
			const tokenPayload = await this.entraTokenValidator.validateAccessToken(authToken);
			if (!pageId || !appSessionId || !authToken || !tokenPayload) {
				this.logger.debug("unauthorized - missing required headers or invalid token");
				return null;
			}
			return {
				appId: tokenPayload?.["appId"],
				appSessionId,
				authToken,
				channelId: h("x-teams-channel-id"),
				chatId: h("x-teams-chat-id"),
				meetingId: h("x-teams-meeting-id"),
				messageId: h("x-teams-message-id"),
				pageId,
				subPageId: h("x-teams-sub-page-id"),
				teamId: h("x-teams-team-id"),
				tenantId: tokenPayload["tid"],
				userId: tokenPayload["oid"],
				userName: tokenPayload["name"]
			};
		}
	};
}));
//#endregion
//#region node_modules/@microsoft/teams.apps/dist/app.embed.js
var require_app_embed = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.func = func;
	exports.tab = tab;
	exports.configTab = configTab;
	const remote_function_validator_1 = require_remote_function_validator();
	const utils_1 = require_utils();
	/**
	* add/update a function that can be called remotely
	* @param name The unique function name
	* @param cb The callback to handle the function
	*/
	function func(name, cb) {
		const log = this.log.child("functions").child(name);
		const entraTokenValidator = this.entraTokenValidator;
		const validator = entraTokenValidator ? new remote_function_validator_1.RemoteFunctionValidator(entraTokenValidator, log) : null;
		this.server.registerRoute("POST", `/api/functions/${name}`, async ({ body, headers }) => {
			if (!validator) {
				log.debug("unauthorized - no token validator configured");
				return {
					status: 401,
					body: "unauthorized"
				};
			}
			const context = await validator.check(headers);
			if (!context) return {
				status: 401,
				body: "unauthorized"
			};
			const getCurrentConversationId = utils_1.functionContext.getConversationIdResolver(this, log.child("getCurrentConversationId"), context);
			const send = async (activity) => {
				const conversationId = await getCurrentConversationId();
				return !conversationId ? null : await this.send(conversationId, activity);
			};
			return {
				status: 200,
				body: await cb({
					...context,
					log,
					api: this.api,
					appGraph: this.graph,
					data: body,
					getCurrentConversationId,
					send
				})
			};
		});
		return this;
	}
	/**
	* add/update a static tab.
	* the tab will be hosted at
	* `http://localhost:{{PORT}}/tabs/{{name}}` or `https://{{BOT_DOMAIN}}/tabs/{{name}}`
	* @remark scopes default to `personal`
	* @param name A unique identifier for the entity which the tab displays.
	* @param path The path to the web `dist` folder.
	*/
	function tab(name, path, options) {
		if (!this._manifest.staticTabs) this._manifest.staticTabs = [];
		const i = this._manifest.staticTabs.findIndex((t) => t.entityId === name);
		const tab = {
			entityId: name,
			contentUrl: `https://\${{BOT_DOMAIN}}/tabs/${name}`,
			scopes: ["personal"],
			...options
		};
		if (i > -1) this._manifest.staticTabs[i] = tab;
		else this._manifest.staticTabs.push(tab);
		this.server.serveStatic(`/tabs/${name}`, path);
		return this;
	}
	/**
	* add a configurable tab
	* @remark scopes defaults to `team`
	* @param url The url to use when configuring the tab.
	*/
	function configTab(url, options) {
		if (!this._manifest.configurableTabs) this._manifest.configurableTabs = [];
		this._manifest.configurableTabs.push({
			configurationUrl: url,
			scopes: ["team"],
			...options
		});
		return this;
	}
}));
//#endregion
//#region node_modules/@microsoft/teams.apps/dist/app.events.js
var require_app_events = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.event = event;
	exports.onError = onError;
	exports.onActivitySent = onActivitySent;
	exports.onActivityResponse = onActivityResponse;
	/**
	* subscribe to an event
	* @param name the event to subscribe to
	* @param cb the callback to invoke
	*/
	function event(name, cb) {
		this.events.on(name, cb);
		return this;
	}
	async function onError(event) {
		for (const plugin of this.plugins) if (plugin.onError) await plugin.onError(event);
		this.events.emit("error", event);
	}
	async function onActivitySent(event) {
		for (const plugin of this.plugins) if (plugin.onActivitySent) await plugin.onActivitySent(event);
		this.events.emit("activity.sent", event);
	}
	async function onActivityResponse(event) {
		for (const plugin of this.plugins) if (plugin.onActivityResponse) await plugin.onActivityResponse(event);
		this.events.emit("activity.response", event);
	}
}));
//#endregion
//#region node_modules/@microsoft/teams.apps/dist/app.oauth.js
var require_app_oauth = /* @__PURE__ */ __commonJSMin(((exports) => {
	var __createBinding = exports && exports.__createBinding || (Object.create ? (function(o, m, k, k2) {
		if (k2 === void 0) k2 = k;
		var desc = Object.getOwnPropertyDescriptor(m, k);
		if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) desc = {
			enumerable: true,
			get: function() {
				return m[k];
			}
		};
		Object.defineProperty(o, k2, desc);
	}) : (function(o, m, k, k2) {
		if (k2 === void 0) k2 = k;
		o[k2] = m[k];
	}));
	var __setModuleDefault = exports && exports.__setModuleDefault || (Object.create ? (function(o, v) {
		Object.defineProperty(o, "default", {
			enumerable: true,
			value: v
		});
	}) : function(o, v) {
		o["default"] = v;
	});
	var __importStar = exports && exports.__importStar || (function() {
		var ownKeys = function(o) {
			ownKeys = Object.getOwnPropertyNames || function(o) {
				var ar = [];
				for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
				return ar;
			};
			return ownKeys(o);
		};
		return function(mod) {
			if (mod && mod.__esModule) return mod;
			var result = {};
			if (mod != null) {
				for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
			}
			__setModuleDefault(result, mod);
			return result;
		};
	})();
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.onTokenExchange = onTokenExchange;
	exports.onVerifyState = onVerifyState;
	exports.onSignInFailure = onSignInFailure;
	const axios_1 = require_axios();
	const graph = __importStar(require_dist$1());
	async function onTokenExchange(ctx) {
		const { api, activity, log, next } = ctx;
		if (this.oauth.defaultConnectionName !== activity.value.connectionName) log.warn(`default connection name "${this.oauth.defaultConnectionName}" does not match activity connection name "${activity.value.connectionName}"`);
		try {
			const token = await api.users.token.exchange({
				channelId: activity.channelId,
				userId: activity.from.id,
				connectionName: activity.value.connectionName,
				exchangeRequest: { token: activity.value.token }
			});
			ctx.userGraph = new graph.Client(this.client.clone({ token: token.token }), { baseUrlRoot: this.graphBaseUrl });
			this.events.emit("signin", {
				...ctx,
				token,
				isSignedIn: true
			});
			next(ctx);
			return { status: 200 };
		} catch (error) {
			if (error instanceof axios_1.AxiosError) {
				if (error.status !== 404 && error.status !== 400 && error.status !== 412) {
					this.events.emit("error", {
						error,
						activity
					});
					return { status: error.status || 500 };
				}
			}
			return {
				status: 412,
				body: {
					id: activity.value.id,
					connectionName: activity.value.connectionName,
					failureDetail: "unable to exchange token..."
				}
			};
		}
	}
	async function onVerifyState(ctx) {
		const { log, api, activity, next } = ctx;
		try {
			if (!activity.value.state) {
				log.warn(`auth state not found for conversation "${activity.conversation.id}" and user "${activity.from.id}"`);
				return { status: 404 };
			}
			const token = await api.users.token.get({
				channelId: activity.channelId,
				userId: activity.from.id,
				connectionName: this.oauth.defaultConnectionName,
				code: activity.value.state
			});
			ctx.userGraph = new graph.Client(this.client.clone({ token: token.token }), { baseUrlRoot: this.graphBaseUrl });
			this.events.emit("signin", {
				...ctx,
				token,
				isSignedIn: true
			});
			next(ctx);
			return { status: 200 };
		} catch (error) {
			if (error instanceof axios_1.AxiosError) {
				if (error.status !== 404 && error.status !== 400 && error.status !== 412) {
					this.events.emit("error", {
						error,
						activity
					});
					return { status: error.status || 500 };
				}
			}
			return { status: 412 };
		}
	}
	/**
	* Default handler for signin/failure invoke activities.
	*
	* Teams sends a signin/failure invoke when SSO token exchange fails
	* (e.g., due to a misconfigured Entra app registration). This handler
	* logs the failure details and emits an error event so developers are
	* notified rather than having the failure silently swallowed.
	*
	* Known failure codes (sent by the Teams client):
	* - `installappfailed`: Failed to install the app in the user's personal scope (non-silent).
	* - `authrequestfailed`: The SSO auth request failed after app installation (non-silent).
	* - `installedappnotfound`: The bot app is not installed for the user or group chat.
	* - `invokeerror`: A generic error occurred during the SSO invoke flow.
	* - `resourcematchfailed`: The token exchange resource URI on the OAuthCard does not
	*   match the Application ID URI in the Entra app registration's "Expose an API" section.
	* - `oauthcardnotvalid`: The bot's OAuthCard could not be parsed.
	* - `tokenmissing`: AAD token acquisition failed.
	* - `userconsentrequired`: The user needs to consent (handled via OAuth card fallback,
	*   does not typically reach the bot).
	* - `interactionrequired`: User interaction is required (handled via OAuth card fallback,
	*   does not typically reach the bot).
	*/
	async function onSignInFailure(ctx) {
		const { log, activity, next } = ctx;
		const { code, message } = activity.value;
		log.warn(`sign-in failed for user "${activity.from.id}" in conversation "${activity.conversation.id}": ${code} — ${message}. If the code is 'resourcematchfailed', verify that your Entra app registration has 'Expose an API' configured with the correct Application ID URI matching your OAuth connection's Token Exchange URL.`);
		this.events.emit("error", {
			error: /* @__PURE__ */ new Error(`Sign-in failure: ${code} — ${message}`),
			activity
		});
		next(ctx);
		return { status: 200 };
	}
}));
//#endregion
//#region node_modules/@microsoft/teams.apps/dist/events/activity.js
var require_activity$2 = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
}));
//#endregion
//#region node_modules/@microsoft/teams.apps/dist/events/activity-response.js
var require_activity_response = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
}));
//#endregion
//#region node_modules/@microsoft/teams.apps/dist/events/activity-sent.js
var require_activity_sent = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
}));
//#endregion
//#region node_modules/@microsoft/teams.apps/dist/events/error.js
var require_error = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
}));
//#endregion
//#region node_modules/@microsoft/teams.apps/dist/events/index.js
var require_events = /* @__PURE__ */ __commonJSMin(((exports) => {
	var __createBinding = exports && exports.__createBinding || (Object.create ? (function(o, m, k, k2) {
		if (k2 === void 0) k2 = k;
		var desc = Object.getOwnPropertyDescriptor(m, k);
		if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) desc = {
			enumerable: true,
			get: function() {
				return m[k];
			}
		};
		Object.defineProperty(o, k2, desc);
	}) : (function(o, m, k, k2) {
		if (k2 === void 0) k2 = k;
		o[k2] = m[k];
	}));
	var __exportStar = exports && exports.__exportStar || function(m, exports$10) {
		for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports$10, p)) __createBinding(exports$10, m, p);
	};
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.allIEventKeys = void 0;
	exports.allIEventKeys = Object.keys({
		start: true,
		signin: true,
		error: true,
		activity: true,
		"activity.response": true,
		"activity.sent": true
	});
	__exportStar(require_activity$2(), exports);
	__exportStar(require_activity_response(), exports);
	__exportStar(require_activity_sent(), exports);
	__exportStar(require_error(), exports);
}));
//#endregion
//#region node_modules/@microsoft/teams.apps/dist/app.plugins.js
var require_app_plugins = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.plugin = plugin;
	exports.getPlugin = getPlugin;
	exports.inject = inject;
	exports.getMetadata = getMetadata;
	const events_1 = require_events();
	const dependency_1 = require_dependency();
	const event_1 = require_event$1();
	const plugin_1 = require_plugin$2();
	/**
	* add a plugin
	* @param plugin plugin to add
	*/
	function plugin(plugin) {
		const { name } = getMetadata(plugin);
		if (this.getPlugin(name)) throw new Error(`duplicate plugin "${name}" found`);
		this.plugins.push(plugin);
		this.container.register(name, { useValue: plugin });
		if (plugin.constructor.name !== name) this.container.register(plugin.constructor.name, { useValue: plugin });
		return this;
	}
	/**
	* get a plugin
	*/
	function getPlugin(name) {
		return this.plugins.find((plugin) => {
			return getMetadata(plugin).name === name;
		});
	}
	/**
	* inject fields/events into a plugin
	*/
	function inject(plugin) {
		const { name, dependencies, events } = getMetadata(plugin);
		for (const { key, type, optional } of dependencies) {
			let dependency = this.container.resolve(type);
			if (!dependency) dependency = this.container.resolve(key);
			if (!dependency) {
				if (optional) continue;
				throw new Error(`dependency "${type}" of property "${key}" not found, but plugin "${name}" depends on it`);
			}
			if (type === "ILogger") dependency = dependency.child(name);
			Object.defineProperty(plugin, key, {
				value: dependency,
				writable: true,
				enumerable: false,
				configurable: false
			});
		}
		for (const { key, name } of events) {
			let handler = (..._) => {};
			if (name === "error") handler = (event) => {
				this.onError(event);
			};
			else if (name === "activity") handler = (event) => {
				return this.onActivity(event);
			};
			else if (name === "custom") handler = (name, event) => {
				if (events_1.allIEventKeys.includes(name)) {
					this.log.warn(`event "${name}" is reserved by core app-events but an plugin is trying to emit it`);
					return;
				}
				this.events.emit(name, event);
			};
			Object.defineProperty(plugin, key, {
				value: handler,
				writable: false,
				enumerable: false,
				configurable: false
			});
		}
	}
	function getMetadata(plugin) {
		if (!Reflect.hasMetadata(plugin_1.PLUGIN_METADATA_KEY, plugin.constructor)) throw new Error(`type "${plugin.constructor.name}" is not a valid plugin`);
		const metadata = Reflect.getMetadata(plugin_1.PLUGIN_METADATA_KEY, plugin.constructor);
		const dependencies = Reflect.getMetadata(dependency_1.PLUGIN_DEPENDENCIES_METADATA_KEY, plugin.constructor) || [];
		const events = Reflect.getMetadata(event_1.PLUGIN_EVENTS_METADATA_KEY, plugin.constructor) || [];
		return {
			...metadata,
			dependencies,
			events
		};
	}
}));
//#endregion
//#region node_modules/@microsoft/teams.apps/dist/contexts/activity.js
var require_activity$1 = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.ActivityContext = void 0;
	const teams_api_1 = require_dist$3();
	var ActivityContext = class {
		appId;
		activity;
		ref;
		log;
		api;
		appGraph;
		userGraph;
		storage;
		stream;
		isSignedIn;
		connectionName;
		next;
		activitySender;
		constructor(value) {
			const { activitySender, next, ...rest } = value;
			Object.assign(this, rest);
			this.activitySender = activitySender;
			this.next = next;
			this.stream = activitySender.createStream(value.ref);
			this.connectionName = value.connectionName;
			if (value.activity.type === "message") value.activity = teams_api_1.MessageActivity.from(value.activity).toInterface();
			if (value.activity.type === "messageUpdate") value.activity = teams_api_1.MessageUpdateActivity.from(value.activity).toInterface();
			if (value.activity.type === "messageDelete") value.activity = teams_api_1.MessageDeleteActivity.from(value.activity).toInterface();
			if (value.activity.type === "typing") value.activity = teams_api_1.TypingActivity.from(value.activity).toInterface();
		}
		/**
		* send an activity in the current conversation without quoting.
		*
		* In channels, sends to the current thread. In scopes that do not
		* support threading (group chat, meetings), sends as a normal message.
		* To send with a visual quote of the inbound message, use {@link reply}.
		*
		* @param activity the activity to send
		* @param conversationRef optional conversation reference to send to a different conversation or thread
		*/
		async send(activity, conversationRef) {
			const params = (0, teams_api_1.toActivityParams)(activity);
			if (params.type === "message" && params.recipient?.isTargeted && !params.id) {
				if (!params.recipient) params.recipient = this.activity.from;
			}
			return await this.activitySender.send(params, conversationRef ?? this.ref);
		}
		/**
		* send an activity in the current conversation with a visual quote
		* of the inbound message.
		*
		* In channels, sends to the current thread with a quoted reply.
		* In other scopes, sends with a quoted reply.
		* To send without quoting, use {@link send}.
		*
		* @param activity the activity to send
		*/
		async reply(activity) {
			activity = (0, teams_api_1.toActivityParams)(activity);
			activity.replyToId = this.activity.id;
			if (activity.type === "message" && activity.text) {
				const blockQuote = this.buildBlockQuoteForActivity();
				if (blockQuote) activity.text = `${blockQuote}\r\n${activity.text}`;
			}
			return this.send(activity);
		}
		async signin(options) {
			const { oauthCardText, signInButtonText, connectionName, signInLink, overrideSignInActivity } = {
				oauthCardText: "Please Sign In...",
				signInButtonText: "Sign In",
				...options
			};
			const convo = { ...this.ref };
			try {
				return (await this.api.users.token.get({
					channelId: this.activity.channelId,
					userId: this.activity.from.id,
					connectionName: connectionName || this.connectionName
				})).token;
			} catch (err) {}
			const tokenExchangeState = {
				connectionName: connectionName || this.connectionName,
				conversation: convo,
				relatesTo: this.activity.relatesTo,
				msAppId: this.appId
			};
			if (this.activity.conversation.isGroup) {
				const res = await this.api.conversations.create({
					tenantId: this.activity.conversation.tenantId,
					members: [this.activity.from]
				});
				await this.send({
					type: "message",
					text: oauthCardText
				});
				convo.conversation = { id: res.id };
			}
			const state = Buffer.from(JSON.stringify(tokenExchangeState)).toString("base64");
			const resource = await this.api.bots.signIn.getResource({ state });
			await this.send(overrideSignInActivity?.(resource.tokenExchangeResource, resource.tokenPostResource, resource.signInLink) ?? {
				type: "message",
				inputHint: "acceptingInput",
				recipient: this.activity.from,
				conversation: convo.conversation,
				attachments: [(0, teams_api_1.cardAttachment)("oauth", {
					text: oauthCardText,
					connectionName: connectionName || this.connectionName,
					tokenExchangeResource: resource.tokenExchangeResource,
					tokenPostResource: resource.tokenPostResource,
					buttons: [{
						type: "signin",
						title: signInButtonText,
						value: signInLink || resource.signInLink
					}]
				})]
			}, convo);
		}
		async signout(connectionName) {
			await this.api.users.token.signOut({
				channelId: this.activity.channelId,
				userId: this.activity.from.id,
				connectionName: connectionName || this.connectionName
			});
		}
		toInterface() {
			return {
				activity: this.activity,
				api: this.api,
				appGraph: this.appGraph,
				userGraph: this.userGraph,
				appId: this.appId,
				log: this.log,
				ref: this.ref,
				storage: this.storage,
				stream: this.stream,
				isSignedIn: this.isSignedIn,
				connectionName: this.connectionName,
				userToken: this.userToken,
				next: this.next.bind(this),
				reply: this.reply.bind(this),
				send: this.send.bind(this),
				signin: this.signin.bind(this),
				signout: this.signout.bind(this)
			};
		}
		buildBlockQuoteForActivity() {
			if (this.activity.type === "message" && this.activity.text) {
				const maxLength = 120;
				const truncatedText = this.activity.text.length > maxLength ? `${this.activity.text.substring(0, maxLength)}...` : this.activity.text;
				return `<blockquote itemscope="" itemtype="http://schema.skype.com/Reply" itemid="${this.activity.id}">
<strong itemprop="mri" itemid="${this.activity.from.id}">${this.activity.from.name}</strong><span itemprop="time" itemid="${this.activity.id}"></span>
<p itemprop="preview">${truncatedText}</p>
</blockquote>`;
			} else this.log.debug("Skipping building blockquote for activity type:", this.activity.type);
			return null;
		}
	};
	exports.ActivityContext = ActivityContext;
}));
//#endregion
//#region node_modules/@microsoft/teams.apps/dist/contexts/activity-error.js
var require_activity_error = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
}));
//#endregion
//#region node_modules/@microsoft/teams.apps/dist/contexts/activity-signin.js
var require_activity_signin = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
}));
//#endregion
//#region node_modules/@microsoft/teams.apps/dist/contexts/client.js
var require_client = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
}));
//#endregion
//#region node_modules/@microsoft/teams.apps/dist/contexts/function.js
var require_function = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
}));
//#endregion
//#region node_modules/@microsoft/teams.apps/dist/contexts/index.js
var require_contexts = /* @__PURE__ */ __commonJSMin(((exports) => {
	var __createBinding = exports && exports.__createBinding || (Object.create ? (function(o, m, k, k2) {
		if (k2 === void 0) k2 = k;
		var desc = Object.getOwnPropertyDescriptor(m, k);
		if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) desc = {
			enumerable: true,
			get: function() {
				return m[k];
			}
		};
		Object.defineProperty(o, k2, desc);
	}) : (function(o, m, k, k2) {
		if (k2 === void 0) k2 = k;
		o[k2] = m[k];
	}));
	var __exportStar = exports && exports.__exportStar || function(m, exports$9) {
		for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports$9, p)) __createBinding(exports$9, m, p);
	};
	Object.defineProperty(exports, "__esModule", { value: true });
	__exportStar(require_activity$1(), exports);
	__exportStar(require_activity_error(), exports);
	__exportStar(require_activity_signin(), exports);
	__exportStar(require_client(), exports);
	__exportStar(require_function(), exports);
}));
//#endregion
//#region node_modules/@microsoft/teams.apps/dist/app.process.js
var require_app_process = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.$process = $process;
	const teams_api_1 = require_dist$3();
	const api_1 = require_api();
	const contexts_1 = require_contexts();
	const types_1 = require_types();
	/**
	* activity handler called when an inbound activity is received
	* @param event the received activity event
	*/
	async function $process(event) {
		const { token, body } = event;
		if (!body) throw new Error("Activity body is required");
		const activity = body;
		this.log.debug(`activity/${activity.type}${activity.type === "invoke" ? `/${activity.name}` : ""}`);
		let serviceUrl = activity.serviceUrl || token.serviceUrl;
		if (serviceUrl.endsWith("/")) serviceUrl = serviceUrl.slice(0, serviceUrl.length - 1);
		let userToken;
		try {
			userToken = await this.getUserToken(activity.channelId, activity.from.id);
		} catch (err) {}
		const client = this.client.clone();
		const apiClient = new api_1.ApiClient(serviceUrl, this.client.clone({ token: () => this.getBotToken() }), this.options.apiClientSettings);
		const userGraph = new api_1.GraphClient(client.clone({ token: () => userToken }), { baseUrlRoot: this.graphBaseUrl });
		const appGraph = new api_1.GraphClient(client.clone({ token: () => this.getAppGraphToken(activity.conversation.tenantId ?? "common") }), { baseUrlRoot: this.graphBaseUrl });
		const ref = {
			serviceUrl,
			activityId: activity.id,
			bot: activity.recipient,
			channelId: activity.channelId,
			conversation: activity.conversation,
			locale: activity.locale,
			user: activity.from
		};
		const routes = this.router.select(activity);
		let pluginContexts = {};
		for (let i = this.plugins.length - 1; i > -1; i--) {
			const plugin = this.plugins[i];
			if (plugin.onActivity) {
				const additionalPluginContext = await plugin.onActivity({
					...ref,
					activity,
					token
				});
				if (additionalPluginContext) {
					for (const key in additionalPluginContext) if (key in pluginContexts) this.log.warn(`Plugin context key "${key}" already exists. Overriding.`);
					pluginContexts = {
						...pluginContexts,
						...additionalPluginContext
					};
				}
			}
		}
		let i = -1;
		let data = void 0;
		const next = async (ctx) => {
			if (i === routes.length - 1) return data;
			i++;
			const mergedContext = ctx || {
				...context.toInterface(),
				...pluginContexts
			};
			const res = await routes[i](mergedContext);
			if (res) data = res;
			return data;
		};
		const context = new contexts_1.ActivityContext({
			activity,
			next,
			api: apiClient,
			userGraph,
			appGraph,
			appId: this.id || "",
			log: this.log,
			userToken,
			ref,
			storage: this.storage,
			isSignedIn: !!userToken,
			connectionName: this.oauth.defaultConnectionName,
			activitySender: this.activitySender,
			...pluginContexts
		});
		const send = context.send.bind(context);
		context.send = async (activity, conversationRef) => {
			const res = await send(activity, conversationRef ?? ref);
			this.onActivitySent({
				...conversationRef ?? ref,
				activity: res
			});
			return res;
		};
		context.stream.events.on("chunk", (activity) => {
			this.onActivitySent({
				...ref,
				activity
			});
		});
		context.stream.events.once("close", (activity) => {
			this.onActivitySent({
				...ref,
				activity
			});
		});
		let response;
		try {
			const res = await next();
			await context.stream.close();
			if ((0, teams_api_1.isInvokeResponse)(res)) response = res;
			else response = {
				status: 200,
				body: res
			};
			this.onActivityResponse({
				...ref,
				activity,
				response: res
			});
		} catch (error) {
			if (error instanceof types_1.StreamCancelledError || error?.name === "StreamCancelledError") {
				this.log.debug("stream canceled, returning 200");
				await context.stream.close();
				response = { status: 200 };
			} else {
				response = { status: 500 };
				this.onError({
					error,
					activity
				});
			}
			this.onActivityResponse({
				...ref,
				activity,
				response
			});
		}
		return response;
	}
}));
//#endregion
//#region node_modules/@microsoft/teams.apps/dist/app.routing.js
var require_app_routing = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.on = on;
	exports.message = message;
	exports.use = use;
	/**
	* subscribe to an event
	* @param name event to subscribe to
	* @param cb callback to invoke
	*/
	function on(name, cb) {
		this.router.on(name, cb);
		return this;
	}
	/**
	* subscribe to a message event for a specific pattern
	* @param pattern pattern to match against message text
	* @param cb callback to invoke
	*/
	function message(pattern, cb) {
		this.router.register({
			type: "user",
			select: (activity) => {
				if (activity.type !== "message") return false;
				return new RegExp(pattern).test(activity.text);
			},
			callback: cb
		});
		return this;
	}
	/**
	* register a middleware
	* @param cb callback to invoke
	*/
	function use(cb) {
		this.router.use(cb);
		return this;
	}
}));
//#endregion
//#region node_modules/@microsoft/teams.apps/dist/container/provider.js
var require_provider = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.isValueProvider = isValueProvider;
	exports.isFactoryProvider = isFactoryProvider;
	function isValueProvider(provider) {
		return !!provider.useValue;
	}
	function isFactoryProvider(provider) {
		return !!provider.useFactory;
	}
}));
//#endregion
//#region node_modules/@microsoft/teams.apps/dist/container/container.js
var require_container$1 = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.Container = void 0;
	require_Reflect();
	const provider_1 = require_provider();
	/**
	* @private
	* a singleton container
	*/
	var Container = class {
		values = /* @__PURE__ */ new Map();
		providers = /* @__PURE__ */ new Map();
		has(key) {
			return this.providers.has(key);
		}
		register(key, provider) {
			if (this.providers.has(key)) throw new Error(`key "${key}" already exists`);
			this.providers.set(key, provider);
		}
		resolve(key) {
			let value = this.values.get(key);
			if (value) return value;
			const provider = this.providers.get(key);
			if (!provider) return;
			if ((0, provider_1.isFactoryProvider)(provider)) value = provider.useFactory();
			else value = provider.useValue;
			this.values.set(key, value);
			return value;
		}
		toString() {
			return Object.entries(this.values).map(([key, value]) => `${key} => ${value}`).join("\n");
		}
	};
	exports.Container = Container;
}));
//#endregion
//#region node_modules/@microsoft/teams.apps/dist/container/index.js
var require_container = /* @__PURE__ */ __commonJSMin(((exports) => {
	var __createBinding = exports && exports.__createBinding || (Object.create ? (function(o, m, k, k2) {
		if (k2 === void 0) k2 = k;
		var desc = Object.getOwnPropertyDescriptor(m, k);
		if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) desc = {
			enumerable: true,
			get: function() {
				return m[k];
			}
		};
		Object.defineProperty(o, k2, desc);
	}) : (function(o, m, k, k2) {
		if (k2 === void 0) k2 = k;
		o[k2] = m[k];
	}));
	var __exportStar = exports && exports.__exportStar || function(m, exports$8) {
		for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports$8, p)) __createBinding(exports$8, m, p);
	};
	Object.defineProperty(exports, "__esModule", { value: true });
	__exportStar(require_container$1(), exports);
	__exportStar(require_provider(), exports);
}));
//#endregion
//#region node_modules/object-assign/index.js
/*
object-assign
(c) Sindre Sorhus
@license MIT
*/
var require_object_assign = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	var getOwnPropertySymbols = Object.getOwnPropertySymbols;
	var hasOwnProperty = Object.prototype.hasOwnProperty;
	var propIsEnumerable = Object.prototype.propertyIsEnumerable;
	function toObject(val) {
		if (val === null || val === void 0) throw new TypeError("Object.assign cannot be called with null or undefined");
		return Object(val);
	}
	function shouldUseNative() {
		try {
			if (!Object.assign) return false;
			var test1 = /* @__PURE__ */ new String("abc");
			test1[5] = "de";
			if (Object.getOwnPropertyNames(test1)[0] === "5") return false;
			var test2 = {};
			for (var i = 0; i < 10; i++) test2["_" + String.fromCharCode(i)] = i;
			if (Object.getOwnPropertyNames(test2).map(function(n) {
				return test2[n];
			}).join("") !== "0123456789") return false;
			var test3 = {};
			"abcdefghijklmnopqrst".split("").forEach(function(letter) {
				test3[letter] = letter;
			});
			if (Object.keys(Object.assign({}, test3)).join("") !== "abcdefghijklmnopqrst") return false;
			return true;
		} catch (err) {
			return false;
		}
	}
	module.exports = shouldUseNative() ? Object.assign : function(target, source) {
		var from;
		var to = toObject(target);
		var symbols;
		for (var s = 1; s < arguments.length; s++) {
			from = Object(arguments[s]);
			for (var key in from) if (hasOwnProperty.call(from, key)) to[key] = from[key];
			if (getOwnPropertySymbols) {
				symbols = getOwnPropertySymbols(from);
				for (var i = 0; i < symbols.length; i++) if (propIsEnumerable.call(from, symbols[i])) to[symbols[i]] = from[symbols[i]];
			}
		}
		return to;
	};
}));
//#endregion
//#region node_modules/vary/index.js
/*!
* vary
* Copyright(c) 2014-2017 Douglas Christopher Wilson
* MIT Licensed
*/
var require_vary = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	/**
	* Module exports.
	*/
	module.exports = vary;
	module.exports.append = append;
	/**
	* RegExp to match field-name in RFC 7230 sec 3.2
	*
	* field-name    = token
	* token         = 1*tchar
	* tchar         = "!" / "#" / "$" / "%" / "&" / "'" / "*"
	*               / "+" / "-" / "." / "^" / "_" / "`" / "|" / "~"
	*               / DIGIT / ALPHA
	*               ; any VCHAR, except delimiters
	*/
	var FIELD_NAME_REGEXP = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
	/**
	* Append a field to a vary header.
	*
	* @param {String} header
	* @param {String|Array} field
	* @return {String}
	* @public
	*/
	function append(header, field) {
		if (typeof header !== "string") throw new TypeError("header argument is required");
		if (!field) throw new TypeError("field argument is required");
		var fields = !Array.isArray(field) ? parse(String(field)) : field;
		for (var j = 0; j < fields.length; j++) if (!FIELD_NAME_REGEXP.test(fields[j])) throw new TypeError("field argument contains an invalid header name");
		if (header === "*") return header;
		var val = header;
		var vals = parse(header.toLowerCase());
		if (fields.indexOf("*") !== -1 || vals.indexOf("*") !== -1) return "*";
		for (var i = 0; i < fields.length; i++) {
			var fld = fields[i].toLowerCase();
			if (vals.indexOf(fld) === -1) {
				vals.push(fld);
				val = val ? val + ", " + fields[i] : fields[i];
			}
		}
		return val;
	}
	/**
	* Parse a vary header into an array.
	*
	* @param {String} header
	* @return {Array}
	* @private
	*/
	function parse(header) {
		var end = 0;
		var list = [];
		var start = 0;
		for (var i = 0, len = header.length; i < len; i++) switch (header.charCodeAt(i)) {
			case 32:
				if (start === end) start = end = i + 1;
				break;
			case 44:
				list.push(header.substring(start, end));
				start = end = i + 1;
				break;
			default:
				end = i + 1;
				break;
		}
		list.push(header.substring(start, end));
		return list;
	}
	/**
	* Mark that a request is varied on a header field.
	*
	* @param {Object} res
	* @param {String|Array} field
	* @public
	*/
	function vary(res, field) {
		if (!res || !res.getHeader || !res.setHeader) throw new TypeError("res argument is required");
		var val = res.getHeader("Vary") || "";
		if (val = append(Array.isArray(val) ? val.join(", ") : String(val), field)) res.setHeader("Vary", val);
	}
}));
//#endregion
//#region node_modules/cors/lib/index.js
var require_lib = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	(function() {
		"use strict";
		var assign = require_object_assign();
		var vary = require_vary();
		var defaults = {
			origin: "*",
			methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
			preflightContinue: false,
			optionsSuccessStatus: 204
		};
		function isString(s) {
			return typeof s === "string" || s instanceof String;
		}
		function isOriginAllowed(origin, allowedOrigin) {
			if (Array.isArray(allowedOrigin)) {
				for (var i = 0; i < allowedOrigin.length; ++i) if (isOriginAllowed(origin, allowedOrigin[i])) return true;
				return false;
			} else if (isString(allowedOrigin)) return origin === allowedOrigin;
			else if (allowedOrigin instanceof RegExp) return allowedOrigin.test(origin);
			else return !!allowedOrigin;
		}
		function configureOrigin(options, req) {
			var requestOrigin = req.headers.origin, headers = [], isAllowed;
			if (!options.origin || options.origin === "*") headers.push([{
				key: "Access-Control-Allow-Origin",
				value: "*"
			}]);
			else if (isString(options.origin)) {
				headers.push([{
					key: "Access-Control-Allow-Origin",
					value: options.origin
				}]);
				headers.push([{
					key: "Vary",
					value: "Origin"
				}]);
			} else {
				isAllowed = isOriginAllowed(requestOrigin, options.origin);
				headers.push([{
					key: "Access-Control-Allow-Origin",
					value: isAllowed ? requestOrigin : false
				}]);
				headers.push([{
					key: "Vary",
					value: "Origin"
				}]);
			}
			return headers;
		}
		function configureMethods(options) {
			var methods = options.methods;
			if (methods.join) methods = options.methods.join(",");
			return {
				key: "Access-Control-Allow-Methods",
				value: methods
			};
		}
		function configureCredentials(options) {
			if (options.credentials === true) return {
				key: "Access-Control-Allow-Credentials",
				value: "true"
			};
			return null;
		}
		function configureAllowedHeaders(options, req) {
			var allowedHeaders = options.allowedHeaders || options.headers;
			var headers = [];
			if (!allowedHeaders) {
				allowedHeaders = req.headers["access-control-request-headers"];
				headers.push([{
					key: "Vary",
					value: "Access-Control-Request-Headers"
				}]);
			} else if (allowedHeaders.join) allowedHeaders = allowedHeaders.join(",");
			if (allowedHeaders && allowedHeaders.length) headers.push([{
				key: "Access-Control-Allow-Headers",
				value: allowedHeaders
			}]);
			return headers;
		}
		function configureExposedHeaders(options) {
			var headers = options.exposedHeaders;
			if (!headers) return null;
			else if (headers.join) headers = headers.join(",");
			if (headers && headers.length) return {
				key: "Access-Control-Expose-Headers",
				value: headers
			};
			return null;
		}
		function configureMaxAge(options) {
			var maxAge = (typeof options.maxAge === "number" || options.maxAge) && options.maxAge.toString();
			if (maxAge && maxAge.length) return {
				key: "Access-Control-Max-Age",
				value: maxAge
			};
			return null;
		}
		function applyHeaders(headers, res) {
			for (var i = 0, n = headers.length; i < n; i++) {
				var header = headers[i];
				if (header) {
					if (Array.isArray(header)) applyHeaders(header, res);
					else if (header.key === "Vary" && header.value) vary(res, header.value);
					else if (header.value) res.setHeader(header.key, header.value);
				}
			}
		}
		function cors(options, req, res, next) {
			var headers = [];
			if ((req.method && req.method.toUpperCase && req.method.toUpperCase()) === "OPTIONS") {
				headers.push(configureOrigin(options, req));
				headers.push(configureCredentials(options));
				headers.push(configureMethods(options));
				headers.push(configureAllowedHeaders(options, req));
				headers.push(configureMaxAge(options));
				headers.push(configureExposedHeaders(options));
				applyHeaders(headers, res);
				if (options.preflightContinue) next();
				else {
					res.statusCode = options.optionsSuccessStatus;
					res.setHeader("Content-Length", "0");
					res.end();
				}
			} else {
				headers.push(configureOrigin(options, req));
				headers.push(configureCredentials(options));
				headers.push(configureExposedHeaders(options));
				applyHeaders(headers, res);
				next();
			}
		}
		function middlewareWrapper(o) {
			var optionsCallback = null;
			if (typeof o === "function") optionsCallback = o;
			else optionsCallback = function(req, cb) {
				cb(null, o);
			};
			return function corsMiddleware(req, res, next) {
				optionsCallback(req, function(err, options) {
					if (err) next(err);
					else {
						var corsOptions = assign({}, defaults, options);
						var originCallback = null;
						if (corsOptions.origin && typeof corsOptions.origin === "function") originCallback = corsOptions.origin;
						else if (corsOptions.origin) originCallback = function(origin, cb) {
							cb(null, corsOptions.origin);
						};
						if (originCallback) originCallback(req.headers.origin, function(err2, origin) {
							if (err2 || !origin) next(err2);
							else {
								corsOptions.origin = origin;
								cors(corsOptions, req, res, next);
							}
						});
						else next();
					}
				});
			};
		}
		module.exports = middlewareWrapper;
	})();
}));
//#endregion
//#region node_modules/@microsoft/teams.apps/dist/http/express-adapter.js
var require_express_adapter = /* @__PURE__ */ __commonJSMin(((exports) => {
	var __importDefault = exports && exports.__importDefault || function(mod) {
		return mod && mod.__esModule ? mod : { "default": mod };
	};
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.ExpressAdapter = void 0;
	const http_1$1 = __importDefault(__require("http"));
	const cors_1 = __importDefault(require_lib());
	const express_1$1 = __importDefault(__require("express"));
	const teams_common_1 = require_dist$2();
	/**
	* Express adapter for HttpServer
	*
	* Handles Express-specific HTTP framework concerns:
	* - Express app creation and middleware setup
	* - Route registration via Express routing
	* - Request/response data extraction and sending
	* - Server lifecycle management
	*/
	var ExpressAdapter = class {
		get;
		post;
		patch;
		put;
		delete;
		route;
		use;
		express;
		server;
		logger;
		onError;
		constructor(serverOrApp, options) {
			if (serverOrApp instanceof http_1$1.default.Server) {
				this.express = (0, express_1$1.default)();
				this.server = serverOrApp;
				this.server.on("request", this.express);
			} else if (typeof serverOrApp === "function") this.express = serverOrApp;
			else {
				this.express = (0, express_1$1.default)();
				this.server = http_1$1.default.createServer(this.express);
			}
			this.logger = options?.logger ?? new teams_common_1.ConsoleLogger("ExpressAdapter");
			this.onError = options?.onError;
			this.get = this.express.get.bind(this.express);
			this.post = this.express.post.bind(this.express);
			this.patch = this.express.patch.bind(this.express);
			this.put = this.express.put.bind(this.express);
			this.delete = this.express.delete.bind(this.express);
			this.route = this.express.route.bind(this.express);
			this.use = this.express.use.bind(this.express);
		}
		/**
		* Register a route handler for a given HTTP method and path
		*/
		registerRoute(method, path, handler) {
			if (method !== "POST") throw new Error(`Unsupported HTTP method: ${method}`);
			const expressHandler = async (req, res, next) => {
				try {
					const response = await handler({
						body: req.body,
						headers: req.headers
					});
					res.status(response.status).send(response.body);
				} catch (err) {
					next(err);
				}
			};
			this.express.post(path, express_1$1.default.json(), expressHandler);
		}
		/**
		* Start the server listening on the specified port
		*/
		async start(port) {
			const server = this.server;
			if (!server) throw new Error("Cannot start: server lifecycle is managed externally. Call listen() on your Express app or http.Server directly.");
			return new Promise((resolve, reject) => {
				server.once("error", (err) => {
					if (this.onError) this.onError(err);
					reject(err);
				});
				server.listen(port, () => {
					this.logger.info(`listening on port ${port} 🚀`);
					if (this.onError) server.on("error", this.onError);
					resolve();
				});
			});
		}
		/**
		* Serve static files from a directory
		*/
		serveStatic(path, directory) {
			this.express.use(path, (0, cors_1.default)(), express_1$1.default.static(directory));
		}
		/**
		* Stop the server and close all connections
		*/
		async stop() {
			const server = this.server;
			if (!server) throw new Error("Cannot stop: server lifecycle is managed externally. Call close() on your Express app or http.Server directly.");
			return new Promise((resolve, reject) => {
				server.close((err) => {
					if (err) reject(err);
					else {
						this.logger.info("server stopped");
						resolve();
					}
				});
			});
		}
	};
	exports.ExpressAdapter = ExpressAdapter;
}));
//#endregion
//#region node_modules/@microsoft/teams.apps/dist/http/index.js
var require_http$1 = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.ExpressAdapter = void 0;
	var express_adapter_1 = require_express_adapter();
	Object.defineProperty(exports, "ExpressAdapter", {
		enumerable: true,
		get: function() {
			return express_adapter_1.ExpressAdapter;
		}
	});
}));
//#endregion
//#region node_modules/@microsoft/teams.apps/dist/middleware/auth/service-token-validator.js
var require_service_token_validator = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.ServiceTokenValidator = void 0;
	const teams_api_1 = require_dist$3();
	const jwt_validator_1 = require_jwt_validator();
	/**
	* Derives the JWKS keys URI from an OpenID metadata URL.
	* e.g. "https://login.botframework.com/v1/.well-known/openidconfiguration"
	*   -> "https://login.botframework.com/v1/.well-known/keys"
	*/
	function openIdMetadataToKeysUri(openIdMetadataUrl) {
		return openIdMetadataUrl.replace(/\/openidconfiguration$/, "/keys");
	}
	/**
	* Service token validator for Bot Framework /api/messages requests
	* Validates Bot Framework service tokens
	*/
	var ServiceTokenValidator = class {
		jwtValidator;
		credentials;
		constructor(appId, tenantId, serviceUrl, logger, cloud) {
			const env = cloud ?? teams_api_1.PUBLIC;
			this.jwtValidator = new jwt_validator_1.JwtValidator({
				clientId: appId,
				tenantId,
				loginEndpoint: env.loginEndpoint,
				validateIssuer: { allowedIssuer: env.tokenIssuer },
				validateServiceUrl: serviceUrl ? { expectedServiceUrl: serviceUrl } : void 0,
				jwksUriOptions: {
					type: "uri",
					uri: openIdMetadataToKeysUri(env.openIdMetadataUrl)
				}
			}, logger);
			this.credentials = {
				clientId: appId,
				tenantId
			};
		}
		async check(authHeader, body) {
			const token = authHeader.startsWith("Bearer ") ? authHeader.substring(7) : authHeader;
			const payload = await this.jwtValidator.validateAccessToken(token, { validateServiceUrl: body.serviceUrl ? { expectedServiceUrl: body.serviceUrl } : void 0 });
			if (!payload) throw new Error("Invalid token");
			const serviceUrl = body.serviceUrl || payload.serviceurl || "";
			return {
				appId: payload.appid || this.credentials?.clientId || "",
				from: "azure",
				fromId: payload.sub || "",
				serviceUrl,
				isExpired: () => false
			};
		}
	};
	exports.ServiceTokenValidator = ServiceTokenValidator;
}));
//#endregion
//#region node_modules/@microsoft/teams.apps/dist/http/http-server.js
var require_http_server = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.HttpServer = void 0;
	const teams_common_1 = require_dist$2();
	const service_token_validator_1 = require_service_token_validator();
	/**
	* Configurable HTTP server for receiving Teams activities
	*/
	var HttpServer = class {
		/**
		* Callback invoked when a valid activity request arrives
		* App should set this to process activities
		*/
		onRequest;
		logger;
		credentials;
		skipAuth;
		cloud;
		initialized = false;
		serviceTokenValidator;
		_adapter;
		_messagingEndpoint;
		/**
		* Get the underlying adapter
		* Useful for plugins that need adapter-specific features
		*/
		get adapter() {
			return this._adapter;
		}
		/**
		* Get the messaging endpoint path
		*/
		get messagingEndpoint() {
			return this._messagingEndpoint;
		}
		constructor(adapter, options) {
			this._adapter = adapter;
			this.skipAuth = options.skipAuth ?? false;
			this.logger = options.logger ?? new teams_common_1.ConsoleLogger("HttpServer");
			this._messagingEndpoint = options.messagingEndpoint;
		}
		/**
		* Initialize the server with dependencies (registers routes, prepares adapter)
		* Can be called multiple times - only initializes once
		* Called by App.initialize()
		*/
		async initialize(deps) {
			if (this.initialized) {
				this.logger.debug("HttpServer already initialized, skipping");
				return;
			}
			this.credentials = deps.credentials;
			this.cloud = deps.cloud;
			if (this.credentials && !this.skipAuth) this.serviceTokenValidator = new service_token_validator_1.ServiceTokenValidator(this.credentials.clientId, this.credentials.tenantId, void 0, this.logger, deps.cloud);
			this._adapter.registerRoute("POST", this._messagingEndpoint, async (request) => {
				return this.handleRequest(request);
			});
			this.initialized = true;
		}
		/**
		* Start the HTTP server
		* Called by App.start()
		*/
		async start(port) {
			if (!this._adapter.start) throw new Error("Adapter does not implement start(). Either implement start() in your adapter, or manage server lifecycle manually.");
			await this._adapter.start(port);
		}
		/**
		* Stop the HTTP server
		* Called by App.stop() if implemented
		*/
		async stop() {
			if (!this._adapter.stop) {
				this.logger.warn("Adapter does not implement stop(). Skipping server shutdown.");
				return;
			}
			await this._adapter.stop();
		}
		/**
		* Register a route handler with the adapter
		* Used by app.function() and other app methods
		*/
		registerRoute(method, path, handler) {
			this._adapter.registerRoute(method, path, handler);
		}
		/**
		* Serve static files from a directory
		* Used by app.tab() and other app methods
		*/
		serveStatic(path, directory) {
			if (this._adapter.serveStatic) this._adapter.serveStatic(path, directory);
		}
		/**
		* Handle incoming activity request
		* Validates JWT, dispatches to app, returns response
		*/
		async handleRequest(request) {
			try {
				const body = request.body;
				this.logger.debug("Handling activity", body);
				const auth = await this.authorize(request.headers, body);
				if (!auth.success) return {
					status: 401,
					body: { error: auth.error }
				};
				if (!this.onRequest) throw new Error("HttpServer.onRequest callback not set");
				const response = await this.onRequest({
					body,
					token: auth.token
				});
				return {
					status: response.status || 200,
					body: response.body
				};
			} catch (err) {
				this.logger.error("Error processing activity:", err);
				return {
					status: 500,
					body: { error: "Internal server error" }
				};
			}
		}
		/**
		* Authorize the request by validating the JWT token.
		*/
		async authorize(headers, body) {
			if (this.skipAuth || !this.credentials) return {
				success: true,
				token: {
					appId: "",
					from: "azure",
					fromId: "",
					serviceUrl: body.serviceUrl || "",
					isExpired: () => false
				}
			};
			const raw = headers["authorization"];
			const authHeader = Array.isArray(raw) ? raw[0] : raw;
			if (!authHeader) return {
				success: false,
				error: "Missing authorization header"
			};
			if (!this.serviceTokenValidator) throw new Error("Service token validator not initialized - credentials required");
			try {
				return {
					success: true,
					token: await this.serviceTokenValidator.check(authHeader, body)
				};
			} catch (err) {
				this.logger.error("JWT validation failed", err);
				return {
					success: false,
					error: "JWT validation failed"
				};
			}
		}
	};
	exports.HttpServer = HttpServer;
}));
//#endregion
//#region node_modules/@microsoft/teams.apps/dist/middleware/jwt-validation-middleware.js
var require_jwt_validation_middleware = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.withJwtValidation = withJwtValidation;
	const teams_common_1 = require_dist$2();
	const service_token_validator_1 = require_service_token_validator();
	function withJwtValidation(params) {
		const { credentials, logger: inputLogger, cloud } = params;
		const logger = inputLogger?.child("jwt-validation-middleware") ?? new teams_common_1.ConsoleLogger("jwt-validation-middleware");
		let validator;
		if (credentials?.clientId) validator = new service_token_validator_1.ServiceTokenValidator(credentials.clientId, credentials.tenantId, void 0, logger, cloud);
		else {
			logger.debug("No credentials provided, skipping service token validation");
			validator = null;
		}
		return async (req, res, next) => {
			if (!validator) {
				logger.debug("No service token validator configured, skipping validation");
				next();
				return;
			}
			const authHeader = req.headers.authorization;
			if (!authHeader) {
				res.status(401).send("unauthorized");
				return;
			}
			const activity = req.body;
			try {
				const token = await validator.check(authHeader, activity);
				logger.debug(`validated service token for activity ${activity.id}`);
				req.validatedToken = token;
				next();
			} catch (err) {
				logger.error("Token validation failed:", err);
				res.status(401).send("Invalid token");
			}
		};
	}
}));
//#endregion
//#region node_modules/@microsoft/teams.apps/dist/middleware/strip-mentions-text.js
var require_strip_mentions_text = /* @__PURE__ */ __commonJSMin(((exports) => {
	var __createBinding = exports && exports.__createBinding || (Object.create ? (function(o, m, k, k2) {
		if (k2 === void 0) k2 = k;
		var desc = Object.getOwnPropertyDescriptor(m, k);
		if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) desc = {
			enumerable: true,
			get: function() {
				return m[k];
			}
		};
		Object.defineProperty(o, k2, desc);
	}) : (function(o, m, k, k2) {
		if (k2 === void 0) k2 = k;
		o[k2] = m[k];
	}));
	var __setModuleDefault = exports && exports.__setModuleDefault || (Object.create ? (function(o, v) {
		Object.defineProperty(o, "default", {
			enumerable: true,
			value: v
		});
	}) : function(o, v) {
		o["default"] = v;
	});
	var __importStar = exports && exports.__importStar || (function() {
		var ownKeys = function(o) {
			ownKeys = Object.getOwnPropertyNames || function(o) {
				var ar = [];
				for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
				return ar;
			};
			return ownKeys(o);
		};
		return function(mod) {
			if (mod && mod.__esModule) return mod;
			var result = {};
			if (mod != null) {
				for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
			}
			__setModuleDefault(result, mod);
			return result;
		};
	})();
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.stripMentionsText = stripMentionsText;
	const api = __importStar(require_dist$3());
	function stripMentionsText(options) {
		return ({ activity, next }) => {
			if (activity.type === "message" || activity.type === "messageUpdate" || activity.type === "typing") activity.text = api.stripMentionsText(activity, options);
			return next();
		};
	}
}));
//#endregion
//#region node_modules/@microsoft/teams.apps/dist/middleware/with-remote-function-jwt-validation.js
var require_with_remote_function_jwt_validation = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.withRemoteFunctionJwtValidation = withRemoteFunctionJwtValidation;
	const remote_function_validator_1 = require_remote_function_validator();
	/**
	* JWT validation middleware used to validate the entra token when remote functions are invoked.
	*/
	function withRemoteFunctionJwtValidation(params) {
		const entraTokenValidator = params.entraTokenValidator;
		const log = params.logger;
		const validator = entraTokenValidator ? new remote_function_validator_1.RemoteFunctionValidator(entraTokenValidator, log) : null;
		return async (req, res, next) => {
			if (!validator) {
				log.debug("unauthorized - no token validator configured");
				res.status(401).send("unauthorized");
				return;
			}
			const headers = {};
			Object.keys(req.headers).forEach((key) => {
				const value = req.headers[key];
				if (typeof value === "string") headers[key.toLowerCase()] = value;
			});
			const context = await validator.check(headers);
			if (!context) {
				res.status(401).send("unauthorized");
				return;
			}
			req.context = context;
			next();
		};
	}
}));
//#endregion
//#region node_modules/@microsoft/teams.apps/dist/middleware/index.js
var require_middleware = /* @__PURE__ */ __commonJSMin(((exports) => {
	var __createBinding = exports && exports.__createBinding || (Object.create ? (function(o, m, k, k2) {
		if (k2 === void 0) k2 = k;
		var desc = Object.getOwnPropertyDescriptor(m, k);
		if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) desc = {
			enumerable: true,
			get: function() {
				return m[k];
			}
		};
		Object.defineProperty(o, k2, desc);
	}) : (function(o, m, k, k2) {
		if (k2 === void 0) k2 = k;
		o[k2] = m[k];
	}));
	var __exportStar = exports && exports.__exportStar || function(m, exports$7) {
		for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports$7, p)) __createBinding(exports$7, m, p);
	};
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.ServiceTokenValidator = exports.RemoteFunctionValidator = exports.JwtValidator = exports.createEntraTokenValidator = void 0;
	var jwt_validator_1 = require_jwt_validator();
	Object.defineProperty(exports, "createEntraTokenValidator", {
		enumerable: true,
		get: function() {
			return jwt_validator_1.createEntraTokenValidator;
		}
	});
	Object.defineProperty(exports, "JwtValidator", {
		enumerable: true,
		get: function() {
			return jwt_validator_1.JwtValidator;
		}
	});
	var remote_function_validator_1 = require_remote_function_validator();
	Object.defineProperty(exports, "RemoteFunctionValidator", {
		enumerable: true,
		get: function() {
			return remote_function_validator_1.RemoteFunctionValidator;
		}
	});
	var service_token_validator_1 = require_service_token_validator();
	Object.defineProperty(exports, "ServiceTokenValidator", {
		enumerable: true,
		get: function() {
			return service_token_validator_1.ServiceTokenValidator;
		}
	});
	__exportStar(require_jwt_validation_middleware(), exports);
	__exportStar(require_strip_mentions_text(), exports);
	__exportStar(require_with_remote_function_jwt_validation(), exports);
}));
//#endregion
//#region node_modules/@microsoft/teams.apps/dist/oauth.js
var require_oauth = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.DEFAULT_OAUTH_SETTINGS = void 0;
	exports.DEFAULT_OAUTH_SETTINGS = { defaultConnectionName: "graph" };
}));
//#endregion
//#region node_modules/@microsoft/teams.apps/dist/routes/activity.js
var require_activity = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
}));
//#endregion
//#region node_modules/@microsoft/teams.apps/dist/routes/conversation-update.js
var require_conversation_update = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
}));
//#endregion
//#region node_modules/@microsoft/teams.apps/dist/routes/event.js
var require_event = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.EVENT_ALIASES = void 0;
	exports.EVENT_ALIASES = {
		"application/vnd.microsoft.readReceipt": "readReceipt",
		"application/vnd.microsoft.meetingStart": "meetingStart",
		"application/vnd.microsoft.meetingEnd": "meetingEnd",
		"application/vnd.microsoft.meetingParticipantJoin": "meetingParticipantJoin",
		"application/vnd.microsoft.meetingParticipantLeave": "meetingParticipantLeave"
	};
}));
//#endregion
//#region node_modules/@microsoft/teams.apps/dist/routes/install.js
var require_install = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
}));
//#endregion
//#region node_modules/@microsoft/teams.apps/dist/routes/invoke/card-action.js
var require_card_action = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
}));
//#endregion
//#region node_modules/@microsoft/teams.apps/dist/routes/invoke/dialog-open.js
var require_dialog_open = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
}));
//#endregion
//#region node_modules/@microsoft/teams.apps/dist/routes/invoke/dialog-submit.js
var require_dialog_submit = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
}));
//#endregion
//#region node_modules/@microsoft/teams.apps/dist/routes/invoke/file-consent.js
var require_file_consent = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
}));
//#endregion
//#region node_modules/@microsoft/teams.apps/dist/routes/invoke/message-extension-submit.js
var require_message_extension_submit = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
}));
//#endregion
//#region node_modules/@microsoft/teams.apps/dist/routes/invoke/message-submit.js
var require_message_submit = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
}));
//#endregion
//#region node_modules/@microsoft/teams.apps/dist/routes/invoke/index.js
var require_invoke = /* @__PURE__ */ __commonJSMin(((exports) => {
	var __createBinding = exports && exports.__createBinding || (Object.create ? (function(o, m, k, k2) {
		if (k2 === void 0) k2 = k;
		var desc = Object.getOwnPropertyDescriptor(m, k);
		if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) desc = {
			enumerable: true,
			get: function() {
				return m[k];
			}
		};
		Object.defineProperty(o, k2, desc);
	}) : (function(o, m, k, k2) {
		if (k2 === void 0) k2 = k;
		o[k2] = m[k];
	}));
	var __exportStar = exports && exports.__exportStar || function(m, exports$6) {
		for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports$6, p)) __createBinding(exports$6, m, p);
	};
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.INVOKE_ALIASES = void 0;
	exports.INVOKE_ALIASES = {
		"config/fetch": "config.open",
		"config/submit": "config.submit",
		"fileConsent/invoke": "file.consent",
		"actionableMessage/executeAction": "message.execute",
		"composeExtension/queryLink": "message.ext.query-link",
		"composeExtension/anonymousQueryLink": "message.ext.anon-query-link",
		"composeExtension/query": "message.ext.query",
		"composeExtension/selectItem": "message.ext.select-item",
		"composeExtension/submitAction": "message.ext.submit",
		"composeExtension/fetchTask": "message.ext.open",
		"composeExtension/querySettingUrl": "message.ext.query-settings-url",
		"composeExtension/setting": "message.ext.setting",
		"composeExtension/onCardButtonClicked": "message.ext.card-button-clicked",
		"task/fetch": "dialog.open",
		"task/submit": "dialog.submit",
		"tab/fetch": "tab.open",
		"tab/submit": "tab.submit",
		"message/fetchTask": "message.fetch-task",
		"message/submitAction": "message.submit",
		"handoff/action": "handoff.action",
		"signin/tokenExchange": "signin.token-exchange",
		"signin/verifyState": "signin.verify-state",
		"signin/failure": "signin.failure",
		"adaptiveCard/action": "card.action"
	};
	__exportStar(require_card_action(), exports);
	__exportStar(require_dialog_open(), exports);
	__exportStar(require_dialog_submit(), exports);
	__exportStar(require_file_consent(), exports);
	__exportStar(require_message_extension_submit(), exports);
	__exportStar(require_message_submit(), exports);
}));
//#endregion
//#region node_modules/@microsoft/teams.apps/dist/routes/message-delete.js
var require_message_delete = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
}));
//#endregion
//#region node_modules/@microsoft/teams.apps/dist/routes/message-update.js
var require_message_update = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
}));
//#endregion
//#region node_modules/@microsoft/teams.apps/dist/routes/index.js
var require_routes = /* @__PURE__ */ __commonJSMin(((exports) => {
	var __createBinding = exports && exports.__createBinding || (Object.create ? (function(o, m, k, k2) {
		if (k2 === void 0) k2 = k;
		var desc = Object.getOwnPropertyDescriptor(m, k);
		if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) desc = {
			enumerable: true,
			get: function() {
				return m[k];
			}
		};
		Object.defineProperty(o, k2, desc);
	}) : (function(o, m, k, k2) {
		if (k2 === void 0) k2 = k;
		o[k2] = m[k];
	}));
	var __exportStar = exports && exports.__exportStar || function(m, exports$5) {
		for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports$5, p)) __createBinding(exports$5, m, p);
	};
	Object.defineProperty(exports, "__esModule", { value: true });
	__exportStar(require_activity(), exports);
	__exportStar(require_conversation_update(), exports);
	__exportStar(require_event(), exports);
	__exportStar(require_install(), exports);
	__exportStar(require_invoke(), exports);
	__exportStar(require_message_delete(), exports);
	__exportStar(require_message_update(), exports);
}));
//#endregion
//#region node_modules/@microsoft/teams.apps/dist/router/router.js
var require_router$1 = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.Router = void 0;
	const routes_1 = require_routes();
	var Router = class {
		routes = [];
		/**
		* select routes that match the inbound activity
		* @param activity the inbound activity
		*/
		select(activity) {
			return this.routes.filter((r) => r.select(activity)).map((r) => r.callback);
		}
		/**
		* register a new route
		* @param route the route to register
		*/
		register(route) {
			if (route.type === "user") {
				const i = this.routes.findIndex((r) => r.name === route.name && r.type === "system");
				if (i > -1) this.routes.splice(i, 1);
			}
			this.routes.push(route);
			return this;
		}
		/**
		* register a middleware
		* @param callback the callback to invoke
		*/
		use(callback, type) {
			this.register({
				type: type || "user",
				select: () => true,
				callback
			});
			return this;
		}
		/**
		* register an activity route
		* @param event event to subscribe to
		* @param callback the callback to invoke
		*/
		on(event, callback, type) {
			this.register({
				name: event,
				type: type || "user",
				select: (activity) => {
					if (event === "activity") return true;
					if (event === activity.type) return true;
					if (activity.type === "conversationUpdate") return event === activity.channelData?.eventType;
					if (activity.type === "installationUpdate") return event === `install.${activity.action}`;
					if (activity.type === "messageDelete") return event === activity.channelData?.eventType;
					if (activity.type === "messageUpdate") return event === activity.channelData?.eventType;
					if (activity.type === "event") return event === routes_1.EVENT_ALIASES[activity.name];
					if (activity.type === "invoke") {
						if (event === routes_1.INVOKE_ALIASES[activity.name]) return true;
						if (activity.name === "fileConsent/invoke") return event === `file.consent.${activity.value.action}`;
						if (activity.name === "composeExtension/submitAction") return event === `message.ext.${activity.value.botMessagePreviewAction}`;
						if (activity.name === "message/submitAction") return event === `message.submit.${activity.value.actionName}`;
						if (activity.name === "task/fetch" && activity.value?.data?.dialog_id) return event === `dialog.open.${activity.value.data.dialog_id}`;
						if (activity.name === "task/submit" && activity.value?.data?.action) return event === `dialog.submit.${activity.value.data.action}`;
						if (activity.name === "adaptiveCard/action" && activity.value?.action?.data?.action) return event === `card.action.${activity.value.action.data.action}`;
					}
					if (event === "mention" && activity.entities?.some((e) => e.type === "mention")) return activity.entities?.find((e) => e.type === "mention" && e.mentioned.id === activity.recipient.id) !== void 0;
					return false;
				},
				callback
			});
			return this;
		}
	};
	exports.Router = Router;
}));
//#endregion
//#region node_modules/@microsoft/teams.apps/dist/router/index.js
var require_router = /* @__PURE__ */ __commonJSMin(((exports) => {
	var __createBinding = exports && exports.__createBinding || (Object.create ? (function(o, m, k, k2) {
		if (k2 === void 0) k2 = k;
		var desc = Object.getOwnPropertyDescriptor(m, k);
		if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) desc = {
			enumerable: true,
			get: function() {
				return m[k];
			}
		};
		Object.defineProperty(o, k2, desc);
	}) : (function(o, m, k, k2) {
		if (k2 === void 0) k2 = k;
		o[k2] = m[k];
	}));
	var __exportStar = exports && exports.__exportStar || function(m, exports$4) {
		for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports$4, p)) __createBinding(exports$4, m, p);
	};
	Object.defineProperty(exports, "__esModule", { value: true });
	__exportStar(require_router$1(), exports);
}));
//#endregion
//#region node_modules/@azure/msal-node/lib/msal-node.cjs
/*! @azure/msal-node v7.1.1 2026-10-21 */
var require_msal_node = /* @__PURE__ */ __commonJSMin(((exports) => {
	var node_crypto = __require("node:crypto");
	var crypto$1 = __require("crypto");
	var jwt = require_jsonwebtoken();
	var http = __require("http");
	var fs = __require("fs");
	var path = __require("path");
	/**
	* This class serializes cache entities to be saved into in-memory object types defined internally
	* @internal
	*/
	var Serializer = class {
		/**
		* serialize the JSON blob
		* @param data - JSON blob cache
		*/
		static serializeJSONBlob(data) {
			return JSON.stringify(data);
		}
		/**
		* Serialize Accounts
		* @param accCache - cache of accounts
		*/
		static serializeAccounts(accCache) {
			const accounts = {};
			Object.keys(accCache).map(function(key) {
				const accountEntity = accCache[key];
				accounts[key] = {
					home_account_id: accountEntity.homeAccountId,
					environment: accountEntity.environment,
					realm: accountEntity.realm,
					local_account_id: accountEntity.localAccountId,
					username: accountEntity.username,
					authority_type: accountEntity.authorityType,
					name: accountEntity.name,
					client_info: accountEntity.clientInfo,
					last_modification_time: accountEntity.lastModificationTime,
					last_modification_app: accountEntity.lastModificationApp,
					tenantProfiles: accountEntity.tenantProfiles?.map((tenantProfile) => {
						return JSON.stringify(tenantProfile);
					})
				};
			});
			return accounts;
		}
		/**
		* Serialize IdTokens
		* @param idTCache - cache of ID tokens
		*/
		static serializeIdTokens(idTCache) {
			const idTokens = {};
			Object.keys(idTCache).map(function(key) {
				const idTEntity = idTCache[key];
				idTokens[key] = {
					home_account_id: idTEntity.homeAccountId,
					environment: idTEntity.environment,
					credential_type: idTEntity.credentialType,
					client_id: idTEntity.clientId,
					secret: idTEntity.secret,
					realm: idTEntity.realm
				};
			});
			return idTokens;
		}
		/**
		* Serializes AccessTokens
		* @param atCache - cache of access tokens
		*/
		static serializeAccessTokens(atCache) {
			const accessTokens = {};
			Object.keys(atCache).map(function(key) {
				const atEntity = atCache[key];
				accessTokens[key] = {
					home_account_id: atEntity.homeAccountId,
					environment: atEntity.environment,
					credential_type: atEntity.credentialType,
					client_id: atEntity.clientId,
					secret: atEntity.secret,
					realm: atEntity.realm,
					target: atEntity.target,
					cached_at: atEntity.cachedAt,
					expires_on: atEntity.expiresOn,
					extended_expires_on: atEntity.extendedExpiresOn,
					refresh_on: atEntity.refreshOn,
					key_id: atEntity.keyId,
					token_type: atEntity.tokenType,
					userAssertionHash: atEntity.userAssertionHash,
					resource: atEntity.resource,
					additionalCacheKeyComponents: atEntity.additionalCacheKeyComponents
				};
			});
			return accessTokens;
		}
		/**
		* Serialize refreshTokens
		* @param rtCache - cache of refresh tokens
		*/
		static serializeRefreshTokens(rtCache) {
			const refreshTokens = {};
			Object.keys(rtCache).map(function(key) {
				const rtEntity = rtCache[key];
				refreshTokens[key] = {
					home_account_id: rtEntity.homeAccountId,
					environment: rtEntity.environment,
					credential_type: rtEntity.credentialType,
					client_id: rtEntity.clientId,
					secret: rtEntity.secret,
					family_id: rtEntity.familyId,
					target: rtEntity.target,
					realm: rtEntity.realm
				};
			});
			return refreshTokens;
		}
		/**
		* Serialize amdtCache
		* @param amdtCache - cache of app metadata
		*/
		static serializeAppMetadata(amdtCache) {
			const appMetadata = {};
			Object.keys(amdtCache).map(function(key) {
				const amdtEntity = amdtCache[key];
				appMetadata[key] = {
					client_id: amdtEntity.clientId,
					environment: amdtEntity.environment,
					family_id: amdtEntity.familyId
				};
			});
			return appMetadata;
		}
		/**
		* Serialize the cache
		* @param inMemCache - itemised cache read from the JSON
		*/
		static serializeAllCache(inMemCache) {
			return {
				Account: this.serializeAccounts(inMemCache.accounts),
				IdToken: this.serializeIdTokens(inMemCache.idTokens),
				AccessToken: this.serializeAccessTokens(inMemCache.accessTokens),
				RefreshToken: this.serializeRefreshTokens(inMemCache.refreshTokens),
				AppMetadata: this.serializeAppMetadata(inMemCache.appMetadata)
			};
		}
	};
	/*! @azure/msal-common v16.14.3 2026-10-21 */
	const CLIENT_ID = "client_id";
	const REDIRECT_URI = "redirect_uri";
	const RESPONSE_TYPE = "response_type";
	const RESPONSE_MODE = "response_mode";
	const GRANT_TYPE = "grant_type";
	const CLAIMS = "claims";
	const SCOPE = "scope";
	const REFRESH_TOKEN = "refresh_token";
	const STATE = "state";
	const NONCE = "nonce";
	const PROMPT = "prompt";
	const CODE = "code";
	const CODE_CHALLENGE = "code_challenge";
	const CODE_CHALLENGE_METHOD = "code_challenge_method";
	const CODE_VERIFIER = "code_verifier";
	const CLIENT_REQUEST_ID = "client-request-id";
	const X_CLIENT_SKU = "x-client-SKU";
	const X_CLIENT_VER = "x-client-VER";
	const X_CLIENT_OS = "x-client-OS";
	const X_CLIENT_CPU = "x-client-CPU";
	const X_CLIENT_CURR_TELEM = "x-client-current-telemetry";
	const X_CLIENT_LAST_TELEM = "x-client-last-telemetry";
	const X_MS_LIB_CAPABILITY = "x-ms-lib-capability";
	const X_APP_NAME = "x-app-name";
	const X_APP_VER = "x-app-ver";
	const POST_LOGOUT_URI = "post_logout_redirect_uri";
	const ID_TOKEN_HINT = "id_token_hint";
	const DEVICE_CODE = "device_code";
	const CLIENT_SECRET = "client_secret";
	const CLIENT_ASSERTION = "client_assertion";
	const CLIENT_ASSERTION_TYPE = "client_assertion_type";
	const TOKEN_TYPE = "token_type";
	const REQ_CNF = "req_cnf";
	const OBO_ASSERTION = "assertion";
	const REQUESTED_TOKEN_USE = "requested_token_use";
	const ON_BEHALF_OF = "on_behalf_of";
	const RETURN_SPA_CODE = "return_spa_code";
	const LOGOUT_HINT = "logout_hint";
	const SID = "sid";
	const LOGIN_HINT = "login_hint";
	const DOMAIN_HINT = "domain_hint";
	const X_CLIENT_EXTRA_SKU = "x-client-xtra-sku";
	const BROKER_CLIENT_ID = "brk_client_id";
	const BROKER_REDIRECT_URI = "brk_redirect_uri";
	const INSTANCE_AWARE = "instance_aware";
	const RESOURCE = "resource";
	const CLI_DATA = "clidata";
	const USER_FEDERATED_IDENTITY_CREDENTIAL = "user_federated_identity_credential";
	const USERNAME = "username";
	const USER_ID = "user_id";
	const FMI_PATH = "fmi_path";
	const ATTRIBUTE_TOKENS = "attribute_tokens";
	/*! @azure/msal-common v16.14.3 2026-10-21 */
	const SKU = "msal.js.common";
	const DEFAULT_AUTHORITY = "https://login.microsoftonline.com/common/";
	const DEFAULT_AUTHORITY_HOST = "login.microsoftonline.com";
	const DEFAULT_COMMON_TENANT = "common";
	const ADFS = "adfs";
	const AAD_INSTANCE_DISCOVERY_ENDPT = `${DEFAULT_AUTHORITY}discovery/instance?api-version=1.1&authorization_endpoint=`;
	const CIAM_AUTH_URL = ".ciamlogin.com";
	const AAD_TENANT_DOMAIN_SUFFIX = ".onmicrosoft.com";
	const RESOURCE_DELIM = "|";
	const OPENID_SCOPE = "openid";
	const PROFILE_SCOPE = "profile";
	const OFFLINE_ACCESS_SCOPE = "offline_access";
	const EMAIL_SCOPE = "email";
	const URL_FORM_CONTENT_TYPE = "application/x-www-form-urlencoded;charset=utf-8";
	const AUTHORIZATION_PENDING = "authorization_pending";
	const NOT_APPLICABLE = "N/A";
	const NOT_AVAILABLE = "Not Available";
	const FORWARD_SLASH = "/";
	const IMDS_ENDPOINT = "http://169.254.169.254/metadata/instance/compute";
	const IMDS_VERSION = "2021-02-01";
	const IMDS_TIMEOUT = 2e3;
	const AZURE_REGION_AUTO_DISCOVER_FLAG = "TryAutoDetect";
	const REGIONAL_AUTH_PUBLIC_CLOUD_SUFFIX = "login.microsoft.com";
	const KNOWN_PUBLIC_CLOUDS = [
		"login.microsoftonline.com",
		"login.windows.net",
		"login.microsoft.com",
		"sts.windows.net"
	];
	const INVALID_INSTANCE = "invalid_instance";
	const HTTP_SUCCESS = 200;
	const HTTP_CLIENT_ERROR_RANGE_START = 400;
	const HTTP_BAD_REQUEST = 400;
	const HTTP_UNAUTHORIZED = 401;
	const HTTP_NOT_FOUND = 404;
	const HTTP_REQUEST_TIMEOUT = 408;
	const HTTP_GONE = 410;
	const HTTP_TOO_MANY_REQUESTS = 429;
	const HTTP_CLIENT_ERROR_RANGE_END = 499;
	const HTTP_SERVER_ERROR = 500;
	const HTTP_SERVER_ERROR_RANGE_START = 500;
	const HTTP_SERVICE_UNAVAILABLE = 503;
	const HTTP_GATEWAY_TIMEOUT = 504;
	const HTTP_SERVER_ERROR_RANGE_END = 599;
	const OIDC_DEFAULT_SCOPES = [
		OPENID_SCOPE,
		PROFILE_SCOPE,
		OFFLINE_ACCESS_SCOPE
	];
	const OIDC_SCOPES = [...OIDC_DEFAULT_SCOPES, EMAIL_SCOPE];
	/**
	* Request header names
	*/
	const HeaderNames = {
		CONTENT_TYPE: "Content-Type",
		CONTENT_LENGTH: "Content-Length",
		DPOP: "DPoP",
		RETRY_AFTER: "Retry-After",
		CCS_HEADER: "X-AnchorMailbox",
		WWWAuthenticate: "WWW-Authenticate",
		AuthenticationInfo: "Authentication-Info",
		X_MS_REQUEST_ID: "x-ms-request-id",
		X_MS_HTTP_VERSION: "x-ms-httpver"
	};
	/**
	* String constants related to AAD Authority
	*/
	const AADAuthority = {
		COMMON: "common",
		ORGANIZATIONS: "organizations",
		CONSUMERS: "consumers"
	};
	/**
	* Claims request keys
	*/
	const ClaimsRequestKeys = {
		ACCESS_TOKEN: "access_token",
		XMS_CC: "xms_cc",
		ID_TOKEN: "id_token",
		SIGNIN_STATE: "signin_state",
		LOGIN_HINT: "login_hint",
		TENANT_REGION_SUB_SCOPE: "tenant_region_sub_scope"
	};
	/**
	* we considered making this "enum" in the request instead of string, however it looks like the allowed list of
	* prompt values kept changing over past couple of years. There are some undocumented prompt values for some
	* internal partners too, hence the choice of generic "string" type instead of the "enum"
	*/
	const PromptValue$1 = {
		LOGIN: "login",
		SELECT_ACCOUNT: "select_account",
		CONSENT: "consent",
		NONE: "none",
		CREATE: "create",
		NO_SESSION: "no_session"
	};
	/**
	* allowed values for codeVerifier
	*/
	const CodeChallengeMethodValues = {
		PLAIN: "plain",
		S256: "S256"
	};
	/**
	* Allowed values for response_type
	*/
	const OAuthResponseType = {
		CODE: "code",
		IDTOKEN_TOKEN: "id_token token"
	};
	/**
	* allowed values for response_mode
	*/
	const ResponseMode$1 = {
		QUERY: "query",
		FRAGMENT: "fragment",
		FORM_POST: "form_post"
	};
	/**
	* allowed grant_type
	*/
	const GrantType = {
		AUTHORIZATION_CODE_GRANT: "authorization_code",
		CLIENT_CREDENTIALS_GRANT: "client_credentials",
		RESOURCE_OWNER_PASSWORD_GRANT: "password",
		REFRESH_TOKEN_GRANT: "refresh_token",
		DEVICE_CODE_GRANT: "device_code",
		JWT_BEARER: "urn:ietf:params:oauth:grant-type:jwt-bearer",
		USER_FIC: "user_fic"
	};
	/**
	* Account types in Cache
	*/
	const CACHE_ACCOUNT_TYPE_MSSTS = "MSSTS";
	const CACHE_ACCOUNT_TYPE_ADFS = "ADFS";
	const CACHE_ACCOUNT_TYPE_GENERIC = "Generic";
	/**
	* Separators used in cache
	*/
	const CACHE_KEY_SEPARATOR = "-";
	const CLIENT_INFO_SEPARATOR = ".";
	/**
	* Credential Type stored in the cache
	*/
	const CredentialType = {
		ID_TOKEN: "IdToken",
		ACCESS_TOKEN: "AccessToken",
		ACCESS_TOKEN_WITH_AUTH_SCHEME: "AccessToken_With_AuthScheme",
		REFRESH_TOKEN: "RefreshToken"
	};
	/**
	* More Cache related constants
	*/
	const APP_METADATA = "appmetadata";
	const CLIENT_INFO = "client_info";
	const THE_FAMILY_ID = "1";
	const AUTHORITY_METADATA_CACHE_KEY = "authority-metadata";
	const AUTHORITY_METADATA_REFRESH_TIME_SECONDS = 3600 * 24;
	const AuthorityMetadataSource = {
		CONFIG: "config",
		CACHE: "cache",
		NETWORK: "network",
		HARDCODED_VALUES: "hardcoded_values"
	};
	const SERVER_TELEM_SCHEMA_VERSION = 5;
	const SERVER_TELEM_MAX_LAST_HEADER_BYTES = 330;
	const SERVER_TELEM_MAX_CACHED_ERRORS = 50;
	const SERVER_TELEM_CACHE_KEY = "server-telemetry";
	const SERVER_TELEM_CATEGORY_SEPARATOR = "|";
	const SERVER_TELEM_VALUE_SEPARATOR = ",";
	const SERVER_TELEM_OVERFLOW_TRUE = "1";
	const SERVER_TELEM_OVERFLOW_FALSE = "0";
	const SERVER_TELEM_UNKNOWN_ERROR = "unknown_error";
	/**
	* Type of the authentication request
	*/
	const AuthenticationScheme = {
		BEARER: "Bearer",
		POP: "pop",
		DPOP: "DPoP",
		SSH: "ssh-cert"
	};
	/**
	* Constants related to throttling
	*/
	const DEFAULT_THROTTLE_TIME_SECONDS = 60;
	const DEFAULT_MAX_THROTTLE_TIME_SECONDS = 3600;
	const THROTTLING_PREFIX = "throttling";
	const X_MS_LIB_CAPABILITY_VALUE = "retry-after, h429";
	/**
	* Errors
	*/
	const INVALID_GRANT_ERROR = "invalid_grant";
	const CLIENT_MISMATCH_ERROR = "client_mismatch";
	/**
	* Password grant parameters
	*/
	const PasswordGrantConstants = {
		username: "username",
		password: "password"
	};
	/**
	* Region Discovery Sources
	*/
	const RegionDiscoverySources = {
		FAILED_AUTO_DETECTION: "1",
		INTERNAL_CACHE: "2",
		ENVIRONMENT_VARIABLE: "3",
		IMDS: "4"
	};
	/**
	* Region Discovery Outcomes
	*/
	const RegionDiscoveryOutcomes = {
		CONFIGURED_NO_AUTO_DETECTION: "2",
		AUTO_DETECTION_REQUESTED_SUCCESSFUL: "4",
		AUTO_DETECTION_REQUESTED_FAILED: "5"
	};
	/**
	* Specifies the reason for fetching the access token from the identity provider
	*/
	const CacheOutcome = {
		NOT_APPLICABLE: "0",
		FORCE_REFRESH_OR_CLAIMS: "1",
		NO_CACHED_ACCESS_TOKEN: "2",
		CACHED_ACCESS_TOKEN_EXPIRED: "3",
		PROACTIVELY_REFRESHED: "4"
	};
	const JsonWebTokenTypes = {
		Pop: "pop",
		Dpop: "dpop+jwt"
	};
	const DEFAULT_TOKEN_RENEWAL_OFFSET_SEC = 300;
	const EncodingTypes = {
		BASE64: "base64",
		HEX: "hex",
		UTF8: "utf-8"
	};
	/*! @azure/msal-common v16.14.3 2026-10-21 */
	function getDefaultErrorMessage(code) {
		return `See https://aka.ms/msal.js.errors#${code} for details`;
	}
	/**
	* General error class thrown by the MSAL.js library.
	*/
	var AuthError = class AuthError extends Error {
		constructor(errorCode, correlationId, errorMessage, suberror) {
			const message = errorMessage || (errorCode ? getDefaultErrorMessage(errorCode) : "");
			const errorString = message ? `${errorCode}: ${message}` : errorCode;
			super(errorString);
			Object.setPrototypeOf(this, AuthError.prototype);
			this.errorCode = errorCode || "";
			this.errorMessage = message || "";
			this.subError = suberror || "";
			this.correlationId = correlationId;
			this.name = "AuthError";
		}
	};
	function createAuthError(code, correlationId, additionalMessage) {
		return new AuthError(code, correlationId, additionalMessage || getDefaultErrorMessage(code));
	}
	/*! @azure/msal-common v16.14.3 2026-10-21 */
	/**
	* ClientAuthErrorMessage class containing string constants used by error codes and messages.
	*/
	/**
	* Error thrown when there is an error in the client code running on the browser.
	*/
	var ClientAuthError = class ClientAuthError extends AuthError {
		constructor(errorCode, correlationId, additionalMessage) {
			super(errorCode, correlationId, additionalMessage);
			this.name = "ClientAuthError";
			Object.setPrototypeOf(this, ClientAuthError.prototype);
		}
	};
	function createClientAuthError(errorCode, correlationId, additionalMessage) {
		return new ClientAuthError(errorCode, correlationId, additionalMessage);
	}
	/*! @azure/msal-common v16.14.3 2026-10-21 */
	const clientInfoDecodingError = "client_info_decoding_error";
	const clientInfoEmptyError = "client_info_empty_error";
	const tokenParsingError = "token_parsing_error";
	const nullOrEmptyToken = "null_or_empty_token";
	const endpointResolutionError = "endpoints_resolution_error";
	const networkError = "network_error";
	const openIdConfigError = "openid_config_error";
	const hashNotDeserialized = "hash_not_deserialized";
	const invalidState = "invalid_state";
	const stateMismatch = "state_mismatch";
	const stateNotFound = "state_not_found";
	const nonceMismatch = "nonce_mismatch";
	const multipleMatchingTokens = "multiple_matching_tokens";
	const multipleMatchingAppMetadata = "multiple_matching_appMetadata";
	const requestCannotBeMade = "request_cannot_be_made";
	const cannotRemoveEmptyScope = "cannot_remove_empty_scope";
	const cannotAppendScopeSet = "cannot_append_scopeset";
	const emptyInputScopeSet = "empty_input_scopeset";
	const noAccountInSilentRequest = "no_account_in_silent_request";
	const invalidCacheRecord = "invalid_cache_record";
	const invalidCacheEnvironment = "invalid_cache_environment";
	const noAccountFound = "no_account_found";
	const noCryptoObject = "no_crypto_object";
	const unexpectedCredentialType = "unexpected_credential_type";
	const dpopTokenTypeMismatch = "dpop_token_type_mismatch";
	const tokenRefreshRequired = "token_refresh_required";
	const tokenClaimsCnfRequiredForSignedJwt = "token_claims_cnf_required_for_signedjwt";
	const authorizationCodeMissingFromServerResponse = "authorization_code_missing_from_server_response";
	const bindingKeyNotRemoved = "binding_key_not_removed";
	const endSessionEndpointNotSupported = "end_session_endpoint_not_supported";
	const keyIdMissing = "key_id_missing";
	const noNetworkConnectivity = "no_network_connectivity";
	const userCanceled = "user_canceled";
	const methodNotImplemented = "method_not_implemented";
	const nestedAppAuthBridgeDisabled = "nested_app_auth_bridge_disabled";
	const platformBrokerError = "platform_broker_error";
	const resourceParameterRequired = "resource_parameter_required";
	const misplacedResourceParam = "misplaced_resource_parameter";
	var ClientAuthErrorCodes = /* @__PURE__ */ Object.freeze({
		__proto__: null,
		authorizationCodeMissingFromServerResponse,
		bindingKeyNotRemoved,
		cannotAppendScopeSet,
		cannotRemoveEmptyScope,
		clientInfoDecodingError,
		clientInfoEmptyError,
		dpopTokenTypeMismatch,
		emptyInputScopeSet,
		endSessionEndpointNotSupported,
		endpointResolutionError,
		hashNotDeserialized,
		invalidCacheEnvironment,
		invalidCacheRecord,
		invalidState,
		keyIdMissing,
		methodNotImplemented,
		misplacedResourceParam,
		multipleMatchingAppMetadata,
		multipleMatchingTokens,
		nestedAppAuthBridgeDisabled,
		networkError,
		noAccountFound,
		noAccountInSilentRequest,
		noCryptoObject,
		noNetworkConnectivity,
		nonceMismatch,
		nullOrEmptyToken,
		openIdConfigError,
		platformBrokerError,
		requestCannotBeMade,
		resourceParameterRequired,
		stateMismatch,
		stateNotFound,
		tokenClaimsCnfRequiredForSignedJwt,
		tokenParsingError,
		tokenRefreshRequired,
		unexpectedCredentialType,
		userCanceled
	});
	/*! @azure/msal-common v16.14.3 2026-10-21 */
	/**
	* Function to build a client info object from server clientInfo string
	* @param rawClientInfo
	* @param crypto
	*/
	function buildClientInfo(rawClientInfo, base64Decode) {
		if (!rawClientInfo) throw createClientAuthError(clientInfoEmptyError, "");
		try {
			const decodedClientInfo = base64Decode(rawClientInfo);
			return JSON.parse(decodedClientInfo);
		} catch (e) {
			throw createClientAuthError(clientInfoDecodingError, "");
		}
	}
	/**
	* Function to build a client info object from cached homeAccountId string
	* @param homeAccountId
	*/
	function buildClientInfoFromHomeAccountId(homeAccountId) {
		if (!homeAccountId) throw createClientAuthError(clientInfoDecodingError, "");
		const clientInfoParts = homeAccountId.split(CLIENT_INFO_SEPARATOR, 2);
		return {
			uid: clientInfoParts[0],
			utid: clientInfoParts.length < 2 ? "" : clientInfoParts[1]
		};
	}
	/*! @azure/msal-common v16.14.3 2026-10-21 */
	/**
	* Extract token by decoding the rawToken
	*
	* @param encodedToken
	*/
	function extractTokenClaims(encodedToken, base64Decode, correlationId) {
		const jswPayload = getJWSPayload(encodedToken, correlationId);
		try {
			const base64Decoded = base64Decode(jswPayload);
			return JSON.parse(base64Decoded);
		} catch (err) {
			throw createClientAuthError(tokenParsingError, correlationId);
		}
	}
	/**
	* Check if the signin_state claim contains "kmsi"
	* @param idTokenClaims
	* @returns
	*/
	function isKmsi(idTokenClaims) {
		if (!idTokenClaims.signin_state) return false;
		/**
		* Signin_state claim known values:
		* dvc_mngd - device is managed
		* dvc_dmjd - device is domain joined
		* kmsi - user opted to "keep me signed in"
		* inknownntwk - Request made inside a known network. Don't use this, use CAE instead.
		*/
		const kmsiClaims = ["kmsi", "dvc_dmjd"];
		return idTokenClaims.signin_state.some((value) => kmsiClaims.includes(value.trim().toLowerCase()));
	}
	/**
	* decode a JWT
	*
	* @param authToken
	*/
	function getJWSPayload(authToken, correlationId) {
		if (!authToken) throw createClientAuthError(nullOrEmptyToken, correlationId);
		const matches = /^([^\.\s]*)\.([^\.\s]+)\.([^\.\s]*)$/.exec(authToken);
		if (!matches || matches.length < 4) throw createClientAuthError(tokenParsingError, correlationId);
		/**
		* const crackedToken = {
		*  header: matches[1],
		*  JWSPayload: matches[2],
		*  JWSSig: matches[3],
		* };
		*/
		return matches[2];
	}
	/*! @azure/msal-common v16.14.3 2026-10-21 */
	/**
	* Returns true if tenantId matches the utid portion of homeAccountId
	* @param tenantId
	* @param homeAccountId
	* @returns
	*/
	function tenantIdMatchesHomeTenant(tenantId, homeAccountId) {
		return !!tenantId && !!homeAccountId && tenantId === homeAccountId.split(".")[1];
	}
	/**
	* Build tenant profile
	* @param homeAccountId - Home account identifier for this account object
	* @param localAccountId - Local account identifer for this account object
	* @param tenantId - Full tenant or organizational id that this account belongs to
	* @param nativeAccountId - Native account identifier for this tenant
	* @param idTokenClaims - Claims from the ID token
	* @returns
	*/
	function buildTenantProfile(homeAccountId, localAccountId, tenantId, nativeAccountId, idTokenClaims) {
		if (idTokenClaims) {
			const { oid, sub, tid, name, tfp, acr, preferred_username, upn, login_hint } = idTokenClaims;
			/**
			* Since there is no way to determine if the authority is AAD or B2C, we exhaust all the possible claims that can serve as tenant ID with the following precedence:
			* tid - TenantID claim that identifies the tenant that issued the token in AAD. Expected in all AAD ID tokens, not present in B2C ID Tokens.
			* tfp - Trust Framework Policy claim that identifies the policy that was used to authenticate the user. Functions as tenant for B2C scenarios.
			* acr - Authentication Context Class Reference claim used only with older B2C policies. Fallback in case tfp is not present, but likely won't be present anyway.
			*/
			const tenantId = tid || tfp || acr || "";
			return {
				tenantId,
				localAccountId: oid || sub || "",
				name,
				username: preferred_username || upn || "",
				loginHint: login_hint,
				isHomeTenant: tenantIdMatchesHomeTenant(tenantId, homeAccountId),
				upn,
				...nativeAccountId && { nativeAccountId }
			};
		} else return {
			tenantId,
			localAccountId,
			username: "",
			isHomeTenant: tenantIdMatchesHomeTenant(tenantId, homeAccountId),
			...nativeAccountId && { nativeAccountId }
		};
	}
	/**
	* Replaces account info that varies by tenant profile sourced from the ID token claims passed in with the tenant-specific account info
	* @param baseAccountInfo
	* @param idTokenClaims
	* @returns
	*/
	function updateAccountTenantProfileData(baseAccountInfo, tenantProfile, idTokenClaims, idTokenSecret) {
		let updatedAccountInfo = baseAccountInfo;
		if (tenantProfile) {
			const { isHomeTenant, ...tenantProfileOverride } = tenantProfile;
			updatedAccountInfo = {
				...baseAccountInfo,
				...tenantProfileOverride
			};
		}
		if (idTokenClaims) {
			const { isHomeTenant, ...claimsSourcedTenantProfile } = buildTenantProfile(baseAccountInfo.homeAccountId, baseAccountInfo.localAccountId, baseAccountInfo.tenantId, updatedAccountInfo.nativeAccountId, idTokenClaims);
			updatedAccountInfo = {
				...updatedAccountInfo,
				...claimsSourcedTenantProfile,
				idTokenClaims,
				idToken: idTokenSecret,
				kmsi: isKmsi(idTokenClaims)
			};
			return updatedAccountInfo;
		}
		return updatedAccountInfo;
	}
	/*! @azure/msal-common v16.14.3 2026-10-21 */
	/**
	* Authority types supported by MSAL.
	*/
	const AuthorityType = {
		Default: 0,
		Adfs: 1,
		Ciam: 3
	};
	/*! @azure/msal-common v16.14.3 2026-10-21 */
	/**
	* Gets tenantId from available ID token claims to set as credential realm with the following precedence:
	* 1. tid - if the token is acquired from an Azure AD tenant tid will be present
	* 2. tfp - if the token is acquired from a modern B2C tenant tfp should be present
	* 3. acr - if the token is acquired from a legacy B2C tenant acr should be present
	* Downcased to match the realm case-insensitive comparison requirements
	* @param idTokenClaims
	* @returns
	*/
	function getTenantIdFromIdTokenClaims(idTokenClaims) {
		if (idTokenClaims) return idTokenClaims.tid || idTokenClaims.tfp || idTokenClaims.acr || null;
		return null;
	}
	/*! @azure/msal-common v16.14.3 2026-10-21 */
	/**
	* Protocol modes supported by MSAL.
	*/
	const ProtocolMode = {
		AAD: "AAD",
		OIDC: "OIDC",
		EAR: "EAR"
	};
	/*! @azure/msal-common v16.14.3 2026-10-21 */
	/**
	* Returns the AccountInfo interface for this account.
	* @internal
	*/
	function getAccountInfo(accountEntity) {
		const tenantProfiles = accountEntity.tenantProfiles || [];
		if (tenantProfiles.length === 0 && accountEntity.realm && accountEntity.localAccountId) tenantProfiles.push(buildTenantProfile(accountEntity.homeAccountId, accountEntity.localAccountId, accountEntity.realm, accountEntity.nativeAccountId));
		const nativeAccountId = tenantProfiles.find((tp) => tp.tenantId === accountEntity.realm)?.nativeAccountId || accountEntity.nativeAccountId;
		return {
			homeAccountId: accountEntity.homeAccountId,
			environment: accountEntity.environment,
			tenantId: accountEntity.realm,
			username: accountEntity.username,
			localAccountId: accountEntity.localAccountId,
			loginHint: accountEntity.loginHint,
			name: accountEntity.name,
			nativeAccountId,
			authorityType: accountEntity.authorityType,
			tenantProfiles: new Map(tenantProfiles.map((tenantProfile) => {
				return [tenantProfile.tenantId, tenantProfile];
			})),
			dataBoundary: accountEntity.dataBoundary
		};
	}
	/**
	* Build Account cache from IdToken, clientInfo and authority/policy. Associated with AAD.
	* @param accountDetails
	* @internal
	*/
	function createAccountEntity(accountDetails, authority, correlationId, base64Decode) {
		let authorityType;
		if (authority.authorityType === AuthorityType.Adfs) authorityType = CACHE_ACCOUNT_TYPE_ADFS;
		else if (authority.protocolMode === ProtocolMode.OIDC) authorityType = CACHE_ACCOUNT_TYPE_GENERIC;
		else authorityType = CACHE_ACCOUNT_TYPE_MSSTS;
		let clientInfo;
		let dataBoundary;
		if (accountDetails.clientInfo && base64Decode) {
			clientInfo = buildClientInfo(accountDetails.clientInfo, base64Decode);
			if (clientInfo.xms_tdbr) dataBoundary = clientInfo.xms_tdbr === "EU" ? "EU" : "None";
		}
		const env = accountDetails.environment || authority && authority.getPreferredCache();
		if (!env) throw createClientAuthError(invalidCacheEnvironment, correlationId);
		const preferredUsername = accountDetails.idTokenClaims?.preferred_username || accountDetails.idTokenClaims?.upn;
		const email = accountDetails.idTokenClaims?.emails ? accountDetails.idTokenClaims.emails[0] : null;
		const username = preferredUsername || email || "";
		const loginHint = accountDetails.idTokenClaims?.login_hint;
		const realm = clientInfo?.utid || getTenantIdFromIdTokenClaims(accountDetails.idTokenClaims) || "";
		const localAccountId = clientInfo?.uid || accountDetails.idTokenClaims?.oid || accountDetails.idTokenClaims?.sub || "";
		let tenantProfiles;
		if (accountDetails.tenantProfiles) tenantProfiles = accountDetails.tenantProfiles;
		else tenantProfiles = [buildTenantProfile(accountDetails.homeAccountId, localAccountId, realm, accountDetails.nativeAccountId, accountDetails.idTokenClaims)];
		return {
			homeAccountId: accountDetails.homeAccountId,
			environment: env,
			realm,
			localAccountId,
			username,
			authorityType,
			loginHint,
			clientInfo: accountDetails.clientInfo,
			name: accountDetails.idTokenClaims?.name || "",
			lastModificationTime: void 0,
			lastModificationApp: void 0,
			cloudGraphHostName: accountDetails.cloudGraphHostName,
			msGraphHost: accountDetails.msGraphHost,
			nativeAccountId: accountDetails.nativeAccountId,
			tenantProfiles,
			dataBoundary
		};
	}
	/**
	* Generate HomeAccountId from server response
	* @param serverClientInfo
	* @param authType
	*/
	function generateHomeAccountId(serverClientInfo, authType, logger, cryptoObj, correlationId, idTokenClaims) {
		if (authType !== AuthorityType.Adfs) {
			if (serverClientInfo) try {
				const clientInfo = buildClientInfo(serverClientInfo, cryptoObj.base64Decode);
				if (clientInfo.uid && clientInfo.utid) return `${clientInfo.uid}.${clientInfo.utid}`;
			} catch (e) {}
			logger.warning("No client info in response", correlationId);
		}
		return idTokenClaims?.sub || "";
	}
	/**
	* Validates an entity: checks for all expected params
	* @param entity
	* @internal
	*/
	function isAccountEntity(entity) {
		if (!entity) return false;
		return entity.hasOwnProperty("homeAccountId") && entity.hasOwnProperty("environment") && entity.hasOwnProperty("realm") && entity.hasOwnProperty("localAccountId") && entity.hasOwnProperty("username") && entity.hasOwnProperty("authorityType");
	}
	/*! @azure/msal-common v16.14.3 2026-10-21 */
	/**
	* AuthErrorMessage class containing string constants used by error codes and messages.
	*/
	const unexpectedError = "unexpected_error";
	const postRequestFailed = "post_request_failed";
	var AuthErrorCodes = /* @__PURE__ */ Object.freeze({
		__proto__: null,
		postRequestFailed,
		unexpectedError
	});
	/*! @azure/msal-common v16.14.3 2026-10-21 */
	/**
	* Error thrown when there is an error in configuration of the MSAL.js library.
	*/
	var ClientConfigurationError = class ClientConfigurationError extends AuthError {
		constructor(errorCode, correlationId) {
			super(errorCode, correlationId);
			this.name = "ClientConfigurationError";
			Object.setPrototypeOf(this, ClientConfigurationError.prototype);
		}
	};
	function createClientConfigurationError(errorCode, correlationId) {
		return new ClientConfigurationError(errorCode, correlationId);
	}
	/*! @azure/msal-common v16.14.3 2026-10-21 */
	const redirectUriEmpty = "redirect_uri_empty";
	const claimsRequestParsingError = "claims_request_parsing_error";
	const authorityUriInsecure = "authority_uri_insecure";
	const urlParseError = "url_parse_error";
	const urlEmptyError = "empty_url_error";
	const emptyInputScopesError = "empty_input_scopes_error";
	const invalidClaims = "invalid_claims";
	const tokenRequestEmpty = "token_request_empty";
	const logoutRequestEmpty = "logout_request_empty";
	const invalidCodeChallengeMethod = "invalid_code_challenge_method";
	const pkceParamsMissing = "pkce_params_missing";
	const invalidCloudDiscoveryMetadata = "invalid_cloud_discovery_metadata";
	const invalidAuthorityMetadata = "invalid_authority_metadata";
	const untrustedAuthority = "untrusted_authority";
	const missingSshJwk = "missing_ssh_jwk";
	const missingSshKid = "missing_ssh_kid";
	const unsupportedAuthenticationScheme = "unsupported_authentication_scheme";
	const missingNonceAuthenticationHeader = "missing_nonce_authentication_header";
	const invalidAuthenticationHeader = "invalid_authentication_header";
	const cannotSetOIDCOptions = "cannot_set_OIDCOptions";
	const cannotAllowPlatformBroker = "cannot_allow_platform_broker";
	const authorityMismatch = "authority_mismatch";
	const invalidRequestMethodForEAR = "invalid_request_method_for_EAR";
	const invalidPlatformBrokerConfiguration = "invalid_platform_broker_configuration";
	const issuerValidationFailed = "issuer_validation_failed";
	const invalidResponseMode = "invalid_response_mode";
	const invalidDpopHtm = "invalid_dpop_htm";
	const invalidDpopHtu = "invalid_dpop_htu";
	const invalidDpopNonce = "invalid_dpop_nonce";
	const dpopMissingResourceContext = "dpop_missing_resource_context";
	var ClientConfigurationErrorCodes = /* @__PURE__ */ Object.freeze({
		__proto__: null,
		authorityMismatch,
		authorityUriInsecure,
		cannotAllowPlatformBroker,
		cannotSetOIDCOptions,
		claimsRequestParsingError,
		dpopMissingResourceContext,
		emptyInputScopesError,
		invalidAuthenticationHeader,
		invalidAuthorityMetadata,
		invalidClaims,
		invalidCloudDiscoveryMetadata,
		invalidCodeChallengeMethod,
		invalidDpopHtm,
		invalidDpopHtu,
		invalidDpopNonce,
		invalidPlatformBrokerConfiguration,
		invalidRequestMethodForEAR,
		invalidResponseMode,
		issuerValidationFailed,
		logoutRequestEmpty,
		missingNonceAuthenticationHeader,
		missingSshJwk,
		missingSshKid,
		pkceParamsMissing,
		redirectUriEmpty,
		tokenRequestEmpty,
		unsupportedAuthenticationScheme,
		untrustedAuthority,
		urlEmptyError,
		urlParseError
	});
	/*! @azure/msal-common v16.14.3 2026-10-21 */
	function isOpenIdConfigResponse(response) {
		return response.hasOwnProperty("authorization_endpoint") && response.hasOwnProperty("token_endpoint") && response.hasOwnProperty("issuer") && response.hasOwnProperty("jwks_uri");
	}
	/*! @azure/msal-common v16.14.3 2026-10-21 */
	/**
	* @hidden
	*/
	var StringUtils = class {
		/**
		* Check if stringified object is empty
		* @param strObj
		*/
		static isEmptyObj(strObj) {
			if (strObj) try {
				const obj = JSON.parse(strObj);
				return Object.keys(obj).length === 0;
			} catch (e) {}
			return true;
		}
		static startsWith(str, search) {
			return str.indexOf(search) === 0;
		}
		static endsWith(str, search) {
			return str.length >= search.length && str.lastIndexOf(search) === str.length - search.length;
		}
		/**
		* Parses string into an object.
		*
		* @param query
		*/
		static queryStringToObject(query) {
			const obj = {};
			const params = query.split("&");
			const decode = (s) => decodeURIComponent(s.replace(/\+/g, " "));
			params.forEach((pair) => {
				if (pair.trim()) {
					const [key, value] = pair.split(/=(.+)/g, 2);
					if (key && value) obj[decode(key)] = decode(value);
				}
			});
			return obj;
		}
		/**
		* Trims entries in an array.
		*
		* @param arr
		*/
		static trimArrayEntries(arr) {
			return arr.map((entry) => entry.trim());
		}
		/**
		* Removes empty strings from array
		* @param arr
		*/
		static removeEmptyStringsFromArray(arr) {
			return arr.filter((entry) => {
				return !!entry;
			});
		}
		/**
		* Attempts to parse a string into JSON
		* @param str
		*/
		static jsonParseHelper(str) {
			try {
				return JSON.parse(str);
			} catch (e) {
				return null;
			}
		}
	};
	/*! @azure/msal-common v16.14.3 2026-10-21 */
	/**
	* Url object class which can perform various transformations on url strings.
	*/
	var UrlString = class UrlString {
		get urlString() {
			return this._urlString;
		}
		constructor(url, correlationId) {
			this._urlString = url;
			this.correlationId = correlationId;
			if (!this._urlString) throw createClientConfigurationError(urlEmptyError, correlationId);
			if (!url.includes("#")) this._urlString = UrlString.canonicalizeUri(url);
		}
		/**
		* Ensure urls are lower case and end with a / character.
		* @param url
		*/
		static canonicalizeUri(url) {
			if (url) {
				let lowerCaseUrl = url.toLowerCase();
				if (StringUtils.endsWith(lowerCaseUrl, "?")) lowerCaseUrl = lowerCaseUrl.slice(0, -1);
				else if (StringUtils.endsWith(lowerCaseUrl, "?/")) lowerCaseUrl = lowerCaseUrl.slice(0, -2);
				if (!StringUtils.endsWith(lowerCaseUrl, "/")) lowerCaseUrl += "/";
				return lowerCaseUrl;
			}
			return url;
		}
		/**
		* Throws if urlString passed is not a valid authority URI string.
		*/
		validateAsUri() {
			let components;
			try {
				components = this.getUrlComponents();
			} catch (e) {
				throw createClientConfigurationError(urlParseError, this.correlationId);
			}
			if (!components.HostNameAndPort || !components.PathSegments) throw createClientConfigurationError(urlParseError, this.correlationId);
			if (!components.Protocol || components.Protocol.toLowerCase() !== "https:") throw createClientConfigurationError(authorityUriInsecure, this.correlationId);
		}
		/**
		* Given a url and a query string return the url with provided query string appended
		* @param url
		* @param queryString
		*/
		static appendQueryString(url, queryString) {
			if (!queryString) return url;
			return url.indexOf("?") < 0 ? `${url}?${queryString}` : `${url}&${queryString}`;
		}
		/**
		* Returns a url with the hash removed
		* @param url
		*/
		static removeHashFromUrl(url) {
			return UrlString.canonicalizeUri(url.split("#")[0]);
		}
		/**
		* Given a url like https://a:b/common/d?e=f#g, and a tenantId, returns https://a:b/tenantId/d
		* @param href The url
		* @param tenantId The tenant id to replace
		*/
		replaceTenantPath(tenantId) {
			const urlObject = this.getUrlComponents();
			const pathArray = urlObject.PathSegments;
			if (tenantId && pathArray.length !== 0 && (pathArray[0] === AADAuthority.COMMON || pathArray[0] === AADAuthority.ORGANIZATIONS)) pathArray[0] = tenantId;
			return UrlString.constructAuthorityUriFromObject(urlObject, this.correlationId);
		}
		/**
		* Parses out the components from a url string.
		* @returns An object with the various components. Please cache this value insted of calling this multiple times on the same url.
		*/
		getUrlComponents() {
			const regEx = RegExp("^(([^:/?#]+):)?(//([^/?#]*))?([^?#]*)(\\?([^#]*))?(#(.*))?");
			const match = this.urlString.match(regEx);
			if (!match) throw createClientConfigurationError(urlParseError, this.correlationId);
			const urlComponents = {
				Protocol: match[1],
				HostNameAndPort: match[4],
				AbsolutePath: match[5],
				QueryString: match[7]
			};
			let pathSegments = urlComponents.AbsolutePath.split("/");
			pathSegments = pathSegments.filter((val) => val && val.length > 0);
			urlComponents.PathSegments = pathSegments;
			if (urlComponents.QueryString && urlComponents.QueryString.endsWith("/")) urlComponents.QueryString = urlComponents.QueryString.substring(0, urlComponents.QueryString.length - 1);
			return urlComponents;
		}
		static getDomainFromUrl(url, correlationId) {
			const regEx = RegExp("^([^:/?#]+://)?([^/?#]*)");
			const match = url.match(regEx);
			if (!match) throw createClientConfigurationError(urlParseError, correlationId);
			return match[2];
		}
		static getAbsoluteUrl(relativeUrl, baseUrl, correlationId) {
			if (relativeUrl[0] === FORWARD_SLASH) {
				const baseComponents = new UrlString(baseUrl, correlationId).getUrlComponents();
				return baseComponents.Protocol + "//" + baseComponents.HostNameAndPort + relativeUrl;
			}
			return relativeUrl;
		}
		static constructAuthorityUriFromObject(urlObject, correlationId) {
			return new UrlString(urlObject.Protocol + "//" + urlObject.HostNameAndPort + "/" + urlObject.PathSegments.join("/"), correlationId);
		}
	};
	/*! @azure/msal-common v16.14.3 2026-10-21 */
	const endpointHosts = [
		{ host: "login.microsoftonline.com" },
		{ host: "login.partner.microsoftonline.cn" },
		{ host: "login.microsoftonline.us" },
		{ host: "login.sovcloud-identity.fr" },
		{ host: "login.sovcloud-identity.de" },
		{ host: "login.sovcloud-identity.sg" }
	];
	function buildOpenIdConfig(host, issuerHost) {
		return {
			token_endpoint: `https://${host}/{tenantid}/oauth2/v2.0/token`,
			jwks_uri: `https://${host}/{tenantid}/discovery/v2.0/keys`,
			issuer: `https://${issuerHost}/{tenantid}/v2.0`,
			authorization_endpoint: `https://${host}/{tenantid}/oauth2/v2.0/authorize`,
			end_session_endpoint: `https://${host}/{tenantid}/oauth2/v2.0/logout`
		};
	}
	const rawMetdataJSON = {
		endpointMetadata: endpointHosts.reduce((acc, { host, issuerHost }) => {
			acc[host] = buildOpenIdConfig(host, issuerHost || host);
			return acc;
		}, {}),
		instanceDiscoveryMetadata: { metadata: [
			{
				preferred_network: "login.microsoftonline.com",
				preferred_cache: "login.windows.net",
				aliases: [
					"login.microsoftonline.com",
					"login.windows.net",
					"login.microsoft.com",
					"sts.windows.net"
				]
			},
			{
				preferred_network: "login.partner.microsoftonline.cn",
				preferred_cache: "login.partner.microsoftonline.cn",
				aliases: ["login.partner.microsoftonline.cn", "login.chinacloudapi.cn"]
			},
			{
				preferred_network: "login.microsoftonline.de",
				preferred_cache: "login.microsoftonline.de",
				aliases: ["login.microsoftonline.de"]
			},
			{
				preferred_network: "login.microsoftonline.us",
				preferred_cache: "login.microsoftonline.us",
				aliases: ["login.microsoftonline.us", "login.usgovcloudapi.net"]
			},
			{
				preferred_network: "login-us.microsoftonline.com",
				preferred_cache: "login-us.microsoftonline.com",
				aliases: ["login-us.microsoftonline.com"]
			},
			{
				preferred_network: "login.sovcloud-identity.fr",
				preferred_cache: "login.sovcloud-identity.fr",
				aliases: ["login.sovcloud-identity.fr"]
			},
			{
				preferred_network: "login.sovcloud-identity.de",
				preferred_cache: "login.sovcloud-identity.de",
				aliases: ["login.sovcloud-identity.de"]
			},
			{
				preferred_network: "login.sovcloud-identity.sg",
				preferred_cache: "login.sovcloud-identity.sg",
				aliases: ["login.sovcloud-identity.sg"]
			}
		] }
	};
	const EndpointMetadata = rawMetdataJSON.endpointMetadata;
	const InstanceDiscoveryMetadata = rawMetdataJSON.instanceDiscoveryMetadata;
	const InstanceDiscoveryMetadataAliases = /* @__PURE__ */ new Set();
	InstanceDiscoveryMetadata.metadata.forEach((metadataEntry) => {
		metadataEntry.aliases.forEach((alias) => {
			InstanceDiscoveryMetadataAliases.add(alias);
		});
	});
	/**
	* Attempts to get an aliases array from the static authority metadata sources based on the canonical authority host
	* @param staticAuthorityOptions
	* @param logger
	* @returns
	*/
	function getAliasesFromStaticSources(staticAuthorityOptions, logger, correlationId) {
		let staticAliases;
		const canonicalAuthority = staticAuthorityOptions.canonicalAuthority;
		if (canonicalAuthority) {
			const authorityHost = new UrlString(canonicalAuthority, correlationId).getUrlComponents().HostNameAndPort;
			staticAliases = getAliasesFromMetadata(logger, correlationId, authorityHost, staticAuthorityOptions.cloudDiscoveryMetadata?.metadata, AuthorityMetadataSource.CONFIG) || getAliasesFromMetadata(logger, correlationId, authorityHost, InstanceDiscoveryMetadata.metadata, AuthorityMetadataSource.HARDCODED_VALUES) || staticAuthorityOptions.knownAuthorities;
		}
		return staticAliases || [];
	}
	/**
	* Returns aliases for from the raw cloud discovery metadata passed in
	* @param authorityHost
	* @param rawCloudDiscoveryMetadata
	* @returns
	*/
	function getAliasesFromMetadata(logger, correlationId, authorityHost, cloudDiscoveryMetadata, source) {
		logger.trace(`getAliasesFromMetadata called with source: '${source}'`, correlationId);
		if (authorityHost && cloudDiscoveryMetadata) {
			const metadata = getCloudDiscoveryMetadataFromNetworkResponse(cloudDiscoveryMetadata, authorityHost);
			if (metadata) {
				logger.trace(`getAliasesFromMetadata: found cloud discovery metadata in '${source}', returning aliases`, correlationId);
				return metadata.aliases;
			} else logger.trace(`getAliasesFromMetadata: did not find cloud discovery metadata in '${source}'`, correlationId);
		}
		return null;
	}
	/**
	* Get cloud discovery metadata for common authorities
	*/
	function getCloudDiscoveryMetadataFromHardcodedValues(authorityHost) {
		return getCloudDiscoveryMetadataFromNetworkResponse(InstanceDiscoveryMetadata.metadata, authorityHost);
	}
	/**
	* Searches instance discovery network response for the entry that contains the host in the aliases list
	* @param response
	* @param authority
	*/
	function getCloudDiscoveryMetadataFromNetworkResponse(response, authorityHost) {
		for (let i = 0; i < response.length; i++) {
			const metadata = response[i];
			if (metadata.aliases.includes(authorityHost)) return metadata;
		}
		return null;
	}
	/*! @azure/msal-common v16.14.3 2026-10-21 */
	const AzureCloudInstance = {
		None: "none",
		AzurePublic: "https://login.microsoftonline.com",
		AzureChina: "https://login.chinacloudapi.cn",
		AzureGermany: "https://login.microsoftonline.de",
		AzureUsGovernment: "https://login.microsoftonline.us"
	};
	/*! @azure/msal-common v16.14.3 2026-10-21 */
	function isCloudInstanceDiscoveryResponse(response) {
		return response.hasOwnProperty("tenant_discovery_endpoint") && response.hasOwnProperty("metadata");
	}
	/*! @azure/msal-common v16.14.3 2026-10-21 */
	function isCloudInstanceDiscoveryErrorResponse(response) {
		return response.hasOwnProperty("error") && response.hasOwnProperty("error_description");
	}
	/*! @azure/msal-common v16.14.3 2026-10-21 */
	/**
	* Time spent sending/waiting for the response of a request to the token endpoint
	*/
	const NetworkClientSendPostRequestAsync = "networkClientSendPostRequestAsync";
	const RefreshTokenClientExecutePostToTokenEndpoint = "refreshTokenClientExecutePostToTokenEndpoint";
	const AuthorizationCodeClientExecutePostToTokenEndpoint = "authorizationCodeClientExecutePostToTokenEndpoint";
	/**
	* Time spent on the network for refresh token acquisition
	*/
	const RefreshTokenClientExecuteTokenRequest = "refreshTokenClientExecuteTokenRequest";
	/**
	* Time taken for acquiring refresh token , records RT size
	*/
	const RefreshTokenClientAcquireToken = "refreshTokenClientAcquireToken";
	/**
	* Time taken for acquiring cached refresh token
	*/
	const RefreshTokenClientAcquireTokenWithCachedRefreshToken = "refreshTokenClientAcquireTokenWithCachedRefreshToken";
	/**
	* Helper function to create token request body in RefreshTokenClient (msal-common).
	*/
	const RefreshTokenClientCreateTokenRequestBody = "refreshTokenClientCreateTokenRequestBody";
	const SilentFlowClientGenerateResultFromCacheRecord = "silentFlowClientGenerateResultFromCacheRecord";
	/**
	* APIs in Authorization Code Client (msal-common)
	*/
	const AuthClientExecuteTokenRequest = "authClientExecuteTokenRequest";
	const AuthClientCreateTokenRequestBody = "authClientCreateTokenRequestBody";
	const UpdateTokenEndpointAuthority = "updateTokenEndpointAuthority";
	/**
	* Generate functions in PopTokenGenerator (msal-common)
	*/
	const PopTokenGenerateCnf = "popTokenGenerateCnf";
	/**
	* handleServerTokenResponse API in ResponseHandler (msal-common)
	*/
	const HandleServerTokenResponse = "handleServerTokenResponse";
	/**
	* Authority functions
	*/
	const AuthorityResolveEndpointsAsync = "authorityResolveEndpointsAsync";
	const AuthorityGetCloudDiscoveryMetadataFromNetwork = "authorityGetCloudDiscoveryMetadataFromNetwork";
	const AuthorityUpdateCloudDiscoveryMetadata = "authorityUpdateCloudDiscoveryMetadata";
	const AuthorityGetEndpointMetadataFromNetwork = "authorityGetEndpointMetadataFromNetwork";
	const AuthorityUpdateEndpointMetadata = "authorityUpdateEndpointMetadata";
	const AuthorityUpdateMetadataWithRegionalInformation = "authorityUpdateMetadataWithRegionalInformation";
	/**
	* Region Discovery functions
	*/
	const RegionDiscoveryDetectRegion = "regionDiscoveryDetectRegion";
	const RegionDiscoveryGetRegionFromIMDS = "regionDiscoveryGetRegionFromIMDS";
	const RegionDiscoveryGetCurrentVersion = "regionDiscoveryGetCurrentVersion";
	/**
	* Cache operations
	*/
	const CacheManagerGetRefreshToken = "cacheManagerGetRefreshToken";
	/*! @azure/msal-common v16.14.3 2026-10-21 */
	/**
	* Wraps a function with a performance measurement.
	* Usage: invoke(functionToCall, performanceClient, "EventName", "correlationId")(...argsToPassToFunction)
	* @param callback
	* @param eventName
	* @param logger
	* @param telemetryClient
	* @param correlationId
	* @returns
	* @internal
	*/
	const invoke = (callback, eventName, logger, telemetryClient, correlationId) => {
		return (...args) => {
			logger.trace(`Executing function '${eventName}'`, correlationId);
			const inProgressEvent = telemetryClient.startMeasurement(eventName, correlationId);
			if (correlationId) telemetryClient.incrementFields({ [`ext.${eventName}CallCount`]: 1 }, correlationId);
			try {
				const result = callback(...args);
				inProgressEvent.end({ success: true });
				logger.trace(`Returning result from '${eventName}'`, correlationId);
				return result;
			} catch (e) {
				logger.trace(`Error occurred in '${eventName}'`, correlationId);
				try {
					logger.trace(JSON.stringify(e), correlationId);
				} catch (e) {
					logger.trace("Unable to print error message.", correlationId);
				}
				inProgressEvent.end({ success: false }, e);
				throw e;
			}
		};
	};
	/**
	* Wraps an async function with a performance measurement.
	* Usage: invokeAsync(functionToCall, performanceClient, "EventName", "correlationId")(...argsToPassToFunction)
	* @param callback
	* @param eventName
	* @param logger
	* @param telemetryClient
	* @param correlationId
	* @returns
	* @internal
	*
	*/
	const invokeAsync = (callback, eventName, logger, telemetryClient, correlationId) => {
		return (...args) => {
			logger.trace(`Executing function '${eventName}'`, correlationId);
			const inProgressEvent = telemetryClient.startMeasurement(eventName, correlationId);
			if (correlationId) telemetryClient.incrementFields({ [`ext.${eventName}CallCount`]: 1 }, correlationId);
			return callback(...args).then((response) => {
				logger.trace(`Returning result from '${eventName}'`, correlationId);
				inProgressEvent.end({ success: true });
				return response;
			}).catch((e) => {
				logger.trace(`Error occurred in '${eventName}'`, correlationId);
				try {
					logger.trace(JSON.stringify(e), correlationId);
				} catch (e) {
					logger.trace("Unable to print error message.", correlationId);
				}
				inProgressEvent.end({ success: false }, e);
				throw e;
			});
		};
	};
	/*! @azure/msal-common v16.14.3 2026-10-21 */
	var RegionDiscovery = class RegionDiscovery {
		constructor(networkInterface, logger, performanceClient, correlationId) {
			this.networkInterface = networkInterface;
			this.logger = logger;
			this.performanceClient = performanceClient;
			this.correlationId = correlationId;
		}
		/**
		* Detect the region from the application's environment.
		*
		* @returns Promise<string | null>
		*/
		async detectRegion(environmentRegion, regionDiscoveryMetadata) {
			let autodetectedRegionName = environmentRegion;
			if (!autodetectedRegionName) {
				const options = RegionDiscovery.IMDS_OPTIONS;
				try {
					const localIMDSVersionResponse = await invokeAsync(this.getRegionFromIMDS.bind(this), RegionDiscoveryGetRegionFromIMDS, this.logger, this.performanceClient, this.correlationId)(IMDS_VERSION, options);
					if (localIMDSVersionResponse.status === HTTP_SUCCESS) {
						autodetectedRegionName = localIMDSVersionResponse.body?.location;
						if (autodetectedRegionName) regionDiscoveryMetadata.region_source = RegionDiscoverySources.IMDS;
					}
					if (localIMDSVersionResponse.status === HTTP_BAD_REQUEST) {
						const currentIMDSVersion = await invokeAsync(this.getCurrentVersion.bind(this), RegionDiscoveryGetCurrentVersion, this.logger, this.performanceClient, this.correlationId)(options);
						if (!currentIMDSVersion) {
							regionDiscoveryMetadata.region_source = RegionDiscoverySources.FAILED_AUTO_DETECTION;
							return null;
						}
						const currentIMDSVersionResponse = await invokeAsync(this.getRegionFromIMDS.bind(this), RegionDiscoveryGetRegionFromIMDS, this.logger, this.performanceClient, this.correlationId)(currentIMDSVersion, options);
						if (currentIMDSVersionResponse.status === HTTP_SUCCESS) {
							autodetectedRegionName = currentIMDSVersionResponse.body?.location;
							if (autodetectedRegionName) regionDiscoveryMetadata.region_source = RegionDiscoverySources.IMDS;
						}
					}
				} catch (e) {
					regionDiscoveryMetadata.region_source = RegionDiscoverySources.FAILED_AUTO_DETECTION;
					return null;
				}
			} else regionDiscoveryMetadata.region_source = RegionDiscoverySources.ENVIRONMENT_VARIABLE;
			if (!autodetectedRegionName) regionDiscoveryMetadata.region_source = RegionDiscoverySources.FAILED_AUTO_DETECTION;
			return autodetectedRegionName || null;
		}
		/**
		* Make the call to the IMDS endpoint
		*
		* @param version
		* @param options
		* @returns Promise<NetworkResponse<ImdsComputeResponse>>
		*/
		async getRegionFromIMDS(version, options) {
			return this.networkInterface.sendGetRequestAsync(`${IMDS_ENDPOINT}?api-version=${version}`, options, IMDS_TIMEOUT);
		}
		/**
		* Get the most recent version of the IMDS endpoint available
		*
		* @returns Promise<string | null>
		*/
		async getCurrentVersion(options) {
			try {
				const response = await this.networkInterface.sendGetRequestAsync(`${IMDS_ENDPOINT}?format=json`, options);
				if (response.status === HTTP_BAD_REQUEST && response.body && response.body["newest-versions"] && response.body["newest-versions"].length > 0) return response.body["newest-versions"][0];
				return null;
			} catch (e) {
				return null;
			}
		}
	};
	RegionDiscovery.IMDS_OPTIONS = { headers: { Metadata: "true" } };
	/*! @azure/msal-common v16.14.3 2026-10-21 */
	/**
	* Utility functions for managing date and time operations.
	*/
	/**
	* return the current time in Unix time (seconds).
	*/
	function nowSeconds() {
		return Math.round((/* @__PURE__ */ new Date()).getTime() / 1e3);
	}
	/**
	* Convert seconds to JS Date object. Seconds can be in a number or string format or undefined (will still return a date).
	* @param seconds
	*/
	function toDateFromSeconds(seconds) {
		if (seconds) return /* @__PURE__ */ new Date(Number(seconds) * 1e3);
		return /* @__PURE__ */ new Date();
	}
	/**
	* check if a token is expired based on given UTC time in seconds.
	* @param expiresOn
	*/
	function isTokenExpired(expiresOn, offset) {
		const expirationSec = Number(expiresOn) || 0;
		return nowSeconds() + offset > expirationSec;
	}
	/**
	* If the current time is earlier than the time that a token was cached at, we must discard the token
	* i.e. The system clock was turned back after acquiring the cached token
	* @param cachedAt
	* @param offset
	*/
	function wasClockTurnedBack(cachedAt) {
		return Number(cachedAt) > nowSeconds();
	}
	/**
	* Waits for t number of milliseconds
	* @param t number
	* @param value T
	*/
	function delay(t, value) {
		return new Promise((resolve) => setTimeout(() => resolve(value), t));
	}
	/*! @azure/msal-common v16.14.3 2026-10-21 */
	/**
	* Create IdTokenEntity
	* @param homeAccountId
	* @param authenticationResult
	* @param clientId
	* @param authority
	*/
	function createIdTokenEntity(homeAccountId, environment, idToken, clientId, tenantId) {
		return {
			credentialType: CredentialType.ID_TOKEN,
			homeAccountId,
			environment,
			clientId,
			secret: idToken,
			realm: tenantId,
			lastUpdatedAt: Date.now().toString()
		};
	}
	/**
	* Create AccessTokenEntity
	* @param homeAccountId
	* @param environment
	* @param accessToken
	* @param clientId
	* @param tenantId
	* @param scopes
	* @param expiresOn
	* @param extExpiresOn
	*/
	function createAccessTokenEntity(homeAccountId, environment, accessToken, clientId, tenantId, scopes, expiresOn, extExpiresOn, base64Decode, correlationId, refreshOn, tokenType, userAssertionHash, keyId, additionalCacheKeyComponents) {
		const atEntity = {
			homeAccountId,
			credentialType: CredentialType.ACCESS_TOKEN,
			secret: accessToken,
			cachedAt: nowSeconds().toString(),
			expiresOn: expiresOn.toString(),
			extendedExpiresOn: extExpiresOn.toString(),
			environment,
			clientId,
			realm: tenantId,
			target: scopes,
			tokenType: tokenType || AuthenticationScheme.BEARER,
			lastUpdatedAt: Date.now().toString()
		};
		if (userAssertionHash) atEntity.userAssertionHash = userAssertionHash;
		if (refreshOn) atEntity.refreshOn = refreshOn.toString();
		const normalizedTokenType = atEntity.tokenType?.toLowerCase();
		if (atEntity.tokenType?.toLowerCase() !== AuthenticationScheme.BEARER.toLowerCase()) {
			atEntity.credentialType = CredentialType.ACCESS_TOKEN_WITH_AUTH_SCHEME;
			switch (normalizedTokenType) {
				case AuthenticationScheme.POP:
					const tokenClaims = extractTokenClaims(accessToken, base64Decode, correlationId);
					if (!tokenClaims?.cnf?.kid) throw createClientAuthError(tokenClaimsCnfRequiredForSignedJwt, correlationId);
					atEntity.keyId = tokenClaims.cnf.kid;
					break;
				case "dpop":
					if (!keyId) throw createClientAuthError(keyIdMissing, correlationId);
					atEntity.keyId = keyId;
					break;
				case AuthenticationScheme.SSH: atEntity.keyId = keyId;
			}
		}
		if (additionalCacheKeyComponents && Object.keys(additionalCacheKeyComponents).length > 0) atEntity.additionalCacheKeyComponents = additionalCacheKeyComponents;
		return atEntity;
	}
	/**
	* Create RefreshTokenEntity
	* @param homeAccountId
	* @param authenticationResult
	* @param clientId
	* @param authority
	*/
	function createRefreshTokenEntity(homeAccountId, environment, refreshToken, clientId, familyId, userAssertionHash, expiresOn) {
		const rtEntity = {
			credentialType: CredentialType.REFRESH_TOKEN,
			homeAccountId,
			environment,
			clientId,
			secret: refreshToken,
			lastUpdatedAt: Date.now().toString()
		};
		if (userAssertionHash) rtEntity.userAssertionHash = userAssertionHash;
		if (familyId) rtEntity.familyId = familyId;
		if (expiresOn) rtEntity.expiresOn = expiresOn.toString();
		return rtEntity;
	}
	function isCredentialEntity(entity) {
		return entity.hasOwnProperty("homeAccountId") && entity.hasOwnProperty("environment") && entity.hasOwnProperty("credentialType") && entity.hasOwnProperty("clientId") && entity.hasOwnProperty("secret");
	}
	/**
	* Validates an entity: checks for all expected params
	* @param entity
	*/
	function isAccessTokenEntity(entity) {
		if (!entity) return false;
		return isCredentialEntity(entity) && entity.hasOwnProperty("realm") && entity.hasOwnProperty("target") && (entity["credentialType"] === CredentialType.ACCESS_TOKEN || entity["credentialType"] === CredentialType.ACCESS_TOKEN_WITH_AUTH_SCHEME);
	}
	/**
	* Validates an entity: checks for all expected params
	* @param entity
	*/
	function isIdTokenEntity(entity) {
		if (!entity) return false;
		return isCredentialEntity(entity) && entity.hasOwnProperty("realm") && entity["credentialType"] === CredentialType.ID_TOKEN;
	}
	/**
	* Validates an entity: checks for all expected params
	* @param entity
	*/
	function isRefreshTokenEntity(entity) {
		if (!entity) return false;
		return isCredentialEntity(entity) && entity["credentialType"] === CredentialType.REFRESH_TOKEN;
	}
	/**
	* validates if a given cache entry is "Telemetry", parses <key,value>
	* @param key
	* @param entity
	*/
	function isServerTelemetryEntity(key, entity) {
		const validateKey = key.indexOf(SERVER_TELEM_CACHE_KEY) === 0;
		let validateEntity = true;
		if (entity) validateEntity = entity.hasOwnProperty("failedRequests") && entity.hasOwnProperty("errors") && entity.hasOwnProperty("cacheHits");
		return validateKey && validateEntity;
	}
	/**
	* validates if a given cache entry is "Throttling", parses <key,value>
	* @param key
	* @param entity
	*/
	function isThrottlingEntity(key, entity) {
		let validateKey = false;
		if (key) validateKey = key.indexOf(THROTTLING_PREFIX) === 0;
		let validateEntity = true;
		if (entity) validateEntity = entity.hasOwnProperty("throttleTime");
		return validateKey && validateEntity;
	}
	/**
	* Generate AppMetadata Cache Key as per the schema: appmetadata-<environment>-<client_id>
	*/
	function generateAppMetadataKey({ environment, clientId }) {
		return [
			APP_METADATA,
			environment,
			clientId
		].join(CACHE_KEY_SEPARATOR).toLowerCase();
	}
	function isAppMetadataEntity(key, entity) {
		if (!entity) return false;
		return key.indexOf(APP_METADATA) === 0 && entity.hasOwnProperty("clientId") && entity.hasOwnProperty("environment");
	}
	/**
	* Validates an entity: checks for all expected params
	* @param entity
	*/
	function isAuthorityMetadataEntity(key, entity) {
		if (!entity) return false;
		return key.indexOf(AUTHORITY_METADATA_CACHE_KEY) === 0 && entity.hasOwnProperty("aliases") && entity.hasOwnProperty("preferred_cache") && entity.hasOwnProperty("preferred_network") && entity.hasOwnProperty("canonical_authority") && entity.hasOwnProperty("authorization_endpoint") && entity.hasOwnProperty("token_endpoint") && entity.hasOwnProperty("issuer") && entity.hasOwnProperty("aliasesFromNetwork") && entity.hasOwnProperty("endpointsFromNetwork") && entity.hasOwnProperty("expiresAt") && entity.hasOwnProperty("jwks_uri");
	}
	/**
	* Reset the exiresAt value
	*/
	function generateAuthorityMetadataExpiresAt() {
		return nowSeconds() + AUTHORITY_METADATA_REFRESH_TIME_SECONDS;
	}
	/** @internal */
	function updateAuthorityEndpointMetadata(authorityMetadata, updatedValues, fromNetwork) {
		authorityMetadata.authorization_endpoint = updatedValues.authorization_endpoint;
		authorityMetadata.token_endpoint = updatedValues.token_endpoint;
		authorityMetadata.end_session_endpoint = updatedValues.end_session_endpoint;
		authorityMetadata.issuer = updatedValues.issuer;
		authorityMetadata.endpointsFromNetwork = fromNetwork;
		authorityMetadata.jwks_uri = updatedValues.jwks_uri;
	}
	/** @internal */
	function updateCloudDiscoveryMetadata(authorityMetadata, updatedValues, fromNetwork) {
		authorityMetadata.aliases = updatedValues.aliases;
		authorityMetadata.preferred_cache = updatedValues.preferred_cache;
		authorityMetadata.preferred_network = updatedValues.preferred_network;
		authorityMetadata.aliasesFromNetwork = fromNetwork;
	}
	/**
	* Returns whether or not the data needs to be refreshed
	* @internal
	*/
	function isAuthorityMetadataExpired(metadata) {
		return metadata.expiresAt <= nowSeconds();
	}
	/**
	* Serialize attribute tokens synchronously (sort and join).
	* This is a sync-only operation for use at request construction time.
	* @param attributeTokens - array of tokens
	* @returns serialized partition string or undefined if no tokens
	*/
	function serializeAttributeTokens(attributeTokens) {
		if (!attributeTokens || attributeTokens.length === 0) return;
		return [...attributeTokens].sort().join(" ");
	}
	/*! @azure/msal-common v16.14.3 2026-10-21 */
	/**
	* The authority class validates the authority URIs used by the user, and retrieves the OpenID Configuration Data from the
	* endpoint. It will store the pertinent config data in this object for use during token calls.
	* @internal
	*/
	var Authority = class Authority {
		constructor(authority, networkInterface, cacheManager, authorityOptions, logger, correlationId, performanceClient, managedIdentity) {
			this.canonicalAuthority = authority;
			this._canonicalAuthority.validateAsUri();
			this.networkInterface = networkInterface;
			this.cacheManager = cacheManager;
			this.authorityOptions = authorityOptions;
			this.regionDiscoveryMetadata = {
				region_used: void 0,
				region_source: void 0,
				region_outcome: void 0
			};
			this.logger = logger;
			this.performanceClient = performanceClient;
			this.correlationId = correlationId;
			this.managedIdentity = managedIdentity || false;
			this.regionDiscovery = new RegionDiscovery(networkInterface, this.logger, this.performanceClient, this.correlationId);
		}
		/**
		* Get {@link AuthorityType:type}
		* @param authorityUri {@link IUri}
		* @private
		*/
		getAuthorityType(authorityUri) {
			if (authorityUri.HostNameAndPort.endsWith(CIAM_AUTH_URL)) return AuthorityType.Ciam;
			const pathSegments = authorityUri.PathSegments;
			if (pathSegments.length) switch (pathSegments[0].toLowerCase()) {
				case ADFS: return AuthorityType.Adfs;
			}
			return AuthorityType.Default;
		}
		get authorityType() {
			return this.getAuthorityType(this.canonicalAuthorityUrlComponents);
		}
		/**
		* ProtocolMode enum representing the way endpoints are constructed.
		*/
		get protocolMode() {
			return this.authorityOptions.protocolMode;
		}
		/**
		* Returns authorityOptions which can be used to reinstantiate a new authority instance
		*/
		get options() {
			return this.authorityOptions;
		}
		/**
		* A URL that is the authority set by the developer
		*/
		get canonicalAuthority() {
			return this._canonicalAuthority.urlString;
		}
		/**
		* Sets canonical authority.
		*/
		set canonicalAuthority(url) {
			this._canonicalAuthority = new UrlString(url, this.correlationId);
			this._canonicalAuthority.validateAsUri();
			this._canonicalAuthorityUrlComponents = null;
		}
		/**
		* Get authority components.
		*/
		get canonicalAuthorityUrlComponents() {
			if (!this._canonicalAuthorityUrlComponents) this._canonicalAuthorityUrlComponents = this._canonicalAuthority.getUrlComponents();
			return this._canonicalAuthorityUrlComponents;
		}
		/**
		* Get hostname and port i.e. login.microsoftonline.com
		*/
		get hostnameAndPort() {
			return this.canonicalAuthorityUrlComponents.HostNameAndPort.toLowerCase();
		}
		/**
		* Get tenant for authority.
		*/
		get tenant() {
			return this.canonicalAuthorityUrlComponents.PathSegments[0];
		}
		/**
		* OAuth /authorize endpoint for requests
		*/
		get authorizationEndpoint() {
			if (this.discoveryComplete()) return this.replacePath(this.metadata.authorization_endpoint);
			else throw createClientAuthError(endpointResolutionError, this.correlationId);
		}
		/**
		* OAuth /token endpoint for requests
		*/
		get tokenEndpoint() {
			if (this.discoveryComplete()) return this.replacePath(this.metadata.token_endpoint);
			else throw createClientAuthError(endpointResolutionError, this.correlationId);
		}
		get deviceCodeEndpoint() {
			if (this.discoveryComplete()) return this.replacePath(this.metadata.token_endpoint.replace("/token", "/devicecode"));
			else throw createClientAuthError(endpointResolutionError, this.correlationId);
		}
		/**
		* OAuth logout endpoint for requests
		*/
		get endSessionEndpoint() {
			if (this.discoveryComplete()) {
				if (!this.metadata.end_session_endpoint) throw createClientAuthError(endSessionEndpointNotSupported, this.correlationId);
				return this.replacePath(this.metadata.end_session_endpoint);
			} else throw createClientAuthError(endpointResolutionError, this.correlationId);
		}
		/**
		* OAuth issuer for requests
		*/
		get selfSignedJwtAudience() {
			if (this.discoveryComplete()) return this.replacePath(this.metadata.issuer);
			else throw createClientAuthError(endpointResolutionError, this.correlationId);
		}
		/**
		* Jwks_uri for token signing keys
		*/
		get jwksUri() {
			if (this.discoveryComplete()) return this.replacePath(this.metadata.jwks_uri);
			else throw createClientAuthError(endpointResolutionError, this.correlationId);
		}
		/**
		* Returns a flag indicating that tenant name can be replaced in authority {@link IUri}
		* @param authorityUri {@link IUri}
		* @private
		*/
		canReplaceTenant(authorityUri) {
			return authorityUri.PathSegments.length === 1 && !Authority.reservedTenantDomains.has(authorityUri.PathSegments[0]) && this.getAuthorityType(authorityUri) === AuthorityType.Default && this.protocolMode !== ProtocolMode.OIDC;
		}
		/**
		* Replaces tenant in url path with current tenant. Defaults to common.
		* @param urlString
		*/
		replaceTenant(urlString) {
			return urlString.replace(/{tenant}|{tenantid}/g, this.tenant);
		}
		/**
		* Replaces path such as tenant or policy with the current tenant or policy.
		* @param urlString
		*/
		replacePath(urlString) {
			let endpoint = urlString;
			const cachedAuthorityUrlComponents = new UrlString(this.metadata.canonical_authority, this.correlationId).getUrlComponents();
			const cachedAuthorityParts = cachedAuthorityUrlComponents.PathSegments;
			this.canonicalAuthorityUrlComponents.PathSegments.forEach((currentPart, index) => {
				let cachedPart = cachedAuthorityParts[index];
				if (index === 0 && this.canReplaceTenant(cachedAuthorityUrlComponents)) {
					const tenantId = new UrlString(this.metadata.authorization_endpoint, this.correlationId).getUrlComponents().PathSegments[0];
					/**
					* Check if AAD canonical authority contains tenant domain name, for example "testdomain.onmicrosoft.com",
					* by comparing its first path segment to the corresponding authorization endpoint path segment, which is
					* always resolved with tenant id by OIDC.
					*/
					if (cachedPart !== tenantId) {
						this.logger.verbose(`Replacing tenant domain name '${cachedPart}' with id '${tenantId}'`, this.correlationId);
						cachedPart = tenantId;
					}
				}
				if (currentPart !== cachedPart) endpoint = endpoint.replace(`/${cachedPart}/`, `/${currentPart}/`);
			});
			return this.replaceTenant(endpoint);
		}
		/**
		* The default open id configuration endpoint for any canonical authority.
		*/
		get defaultOpenIdConfigurationEndpoint() {
			const canonicalAuthorityHost = this.hostnameAndPort;
			if (this.canonicalAuthority.endsWith("v2.0/") || this.authorityType === AuthorityType.Adfs || this.protocolMode === ProtocolMode.OIDC && !this.isAliasOfKnownMicrosoftAuthority(canonicalAuthorityHost)) return `${this.canonicalAuthority}.well-known/openid-configuration`;
			return `${this.canonicalAuthority}v2.0/.well-known/openid-configuration`;
		}
		/**
		* Boolean that returns whether or not tenant discovery has been completed.
		*/
		discoveryComplete() {
			return !!this.metadata;
		}
		/**
		* Perform endpoint discovery to discover aliases, preferred_cache, preferred_network
		* and the /authorize, /token and logout endpoints.
		*/
		async resolveEndpointsAsync() {
			const metadataEntity = this.getCurrentMetadataEntity();
			const cloudDiscoverySource = await invokeAsync(this.updateCloudDiscoveryMetadata.bind(this), AuthorityUpdateCloudDiscoveryMetadata, this.logger, this.performanceClient, this.correlationId)(metadataEntity);
			this.canonicalAuthority = this.canonicalAuthority.replace(this.hostnameAndPort, metadataEntity.preferred_network);
			const endpointSource = await invokeAsync(this.updateEndpointMetadata.bind(this), AuthorityUpdateEndpointMetadata, this.logger, this.performanceClient, this.correlationId)(metadataEntity);
			this.updateCachedMetadata(metadataEntity, cloudDiscoverySource, { source: endpointSource });
			this.performanceClient?.addFields({
				cloudDiscoverySource,
				authorityEndpointSource: endpointSource
			}, this.correlationId);
		}
		/**
		* Returns metadata entity from cache if it exists, otherwise returns a new metadata entity built
		* from the configured canonical authority
		* @returns
		*/
		getCurrentMetadataEntity() {
			let metadataEntity = this.cacheManager.getAuthorityMetadataByAlias(this.hostnameAndPort, this.correlationId);
			if (!metadataEntity) metadataEntity = {
				aliases: [],
				preferred_cache: this.hostnameAndPort,
				preferred_network: this.hostnameAndPort,
				canonical_authority: this.canonicalAuthority,
				authorization_endpoint: "",
				token_endpoint: "",
				end_session_endpoint: "",
				issuer: "",
				aliasesFromNetwork: false,
				endpointsFromNetwork: false,
				expiresAt: generateAuthorityMetadataExpiresAt(),
				jwks_uri: ""
			};
			return metadataEntity;
		}
		/**
		* Updates cached metadata based on metadata source and sets the instance's metadata
		* property to the same value
		* @param metadataEntity
		* @param cloudDiscoverySource
		* @param endpointMetadataResult
		*/
		updateCachedMetadata(metadataEntity, cloudDiscoverySource, endpointMetadataResult) {
			if (cloudDiscoverySource !== AuthorityMetadataSource.CACHE && endpointMetadataResult?.source !== AuthorityMetadataSource.CACHE) {
				metadataEntity.expiresAt = generateAuthorityMetadataExpiresAt();
				metadataEntity.canonical_authority = this.canonicalAuthority;
			}
			const cacheKey = this.cacheManager.generateAuthorityMetadataCacheKey(metadataEntity.preferred_cache, this.correlationId);
			this.cacheManager.setAuthorityMetadata(cacheKey, metadataEntity, this.correlationId);
			this.metadata = metadataEntity;
		}
		/**
		* Update AuthorityMetadataEntity with new endpoints and return where the information came from
		* @param metadataEntity
		*/
		async updateEndpointMetadata(metadataEntity) {
			const localMetadata = this.updateEndpointMetadataFromLocalSources(metadataEntity);
			if (localMetadata) {
				if (localMetadata.source === AuthorityMetadataSource.HARDCODED_VALUES) {
					if (this.authorityOptions.azureRegionConfiguration?.azureRegion) {
						if (localMetadata.metadata) {
							updateAuthorityEndpointMetadata(metadataEntity, await invokeAsync(this.updateMetadataWithRegionalInformation.bind(this), AuthorityUpdateMetadataWithRegionalInformation, this.logger, this.performanceClient, this.correlationId)(localMetadata.metadata), false);
							metadataEntity.canonical_authority = this.canonicalAuthority;
						}
					}
				}
				return localMetadata.source;
			}
			let metadata = await invokeAsync(this.getEndpointMetadataFromNetwork.bind(this), AuthorityGetEndpointMetadataFromNetwork, this.logger, this.performanceClient, this.correlationId)();
			if (metadata) {
				this.validateIssuer(metadata.issuer);
				if (this.authorityOptions.azureRegionConfiguration?.azureRegion) metadata = await invokeAsync(this.updateMetadataWithRegionalInformation.bind(this), AuthorityUpdateMetadataWithRegionalInformation, this.logger, this.performanceClient, this.correlationId)(metadata);
				updateAuthorityEndpointMetadata(metadataEntity, metadata, true);
				return AuthorityMetadataSource.NETWORK;
			} else throw createClientAuthError(openIdConfigError, this.defaultOpenIdConfigurationEndpoint, this.correlationId);
		}
		/**
		* Updates endpoint metadata from local sources and returns where the information was retrieved from and the metadata config
		* response if the source is hardcoded metadata
		* @param metadataEntity
		* @returns
		*/
		updateEndpointMetadataFromLocalSources(metadataEntity) {
			this.logger.verbose("Attempting to get endpoint metadata from authority configuration", this.correlationId);
			const configMetadata = this.getEndpointMetadataFromConfig();
			if (configMetadata) {
				this.logger.verbose("Found endpoint metadata in authority configuration", this.correlationId);
				updateAuthorityEndpointMetadata(metadataEntity, configMetadata, false);
				return { source: AuthorityMetadataSource.CONFIG };
			}
			this.logger.verbose("Did not find endpoint metadata in the config... Attempting to get endpoint metadata from the hardcoded values.", this.correlationId);
			const hardcodedMetadata = this.getEndpointMetadataFromHardcodedValues();
			if (hardcodedMetadata) {
				updateAuthorityEndpointMetadata(metadataEntity, hardcodedMetadata, false);
				return {
					source: AuthorityMetadataSource.HARDCODED_VALUES,
					metadata: hardcodedMetadata
				};
			} else this.logger.verbose("Did not find endpoint metadata in hardcoded values... Attempting to get endpoint metadata from the network metadata cache.", this.correlationId);
			const metadataEntityExpired = isAuthorityMetadataExpired(metadataEntity);
			if (this.isAuthoritySameType(metadataEntity) && metadataEntity.endpointsFromNetwork && !metadataEntityExpired) {
				this.logger.verbose("Found endpoint metadata in the cache.", "");
				return { source: AuthorityMetadataSource.CACHE };
			} else if (metadataEntityExpired) this.logger.verbose("The metadata entity is expired.", "");
			return null;
		}
		/**
		* Compares the number of url components after the domain to determine if the cached
		* authority metadata can be used for the requested authority. Protects against same domain different
		* authority such as login.microsoftonline.com/tenant and login.microsoftonline.com/tfp/tenant/policy
		* @param metadataEntity
		*/
		isAuthoritySameType(metadataEntity) {
			return new UrlString(metadataEntity.canonical_authority, this.correlationId).getUrlComponents().PathSegments.length === this.canonicalAuthorityUrlComponents.PathSegments.length;
		}
		/**
		* Parse authorityMetadata config option
		*/
		getEndpointMetadataFromConfig() {
			if (this.authorityOptions.authorityMetadata) try {
				return JSON.parse(this.authorityOptions.authorityMetadata);
			} catch (e) {
				throw createClientConfigurationError(invalidAuthorityMetadata, this.correlationId);
			}
			return null;
		}
		/**
		* Gets OAuth endpoints from the given OpenID configuration endpoint.
		*
		* @param hasHardcodedMetadata boolean
		*/
		async getEndpointMetadataFromNetwork() {
			const options = {};
			const openIdConfigurationEndpoint = this.defaultOpenIdConfigurationEndpoint;
			this.logger.verbose(`Authority.getEndpointMetadataFromNetwork: attempting to retrieve OAuth endpoints from '${openIdConfigurationEndpoint}'`, this.correlationId);
			try {
				const response = await this.networkInterface.sendGetRequestAsync(openIdConfigurationEndpoint, options);
				if (isOpenIdConfigResponse(response.body)) return response.body;
				else {
					this.logger.verbose(`Authority.getEndpointMetadataFromNetwork: could not parse response as OpenID configuration`, this.correlationId);
					return null;
				}
			} catch (e) {
				this.logger.verbose(`Authority.getEndpointMetadataFromNetwork: '${e}'`, this.correlationId);
				return null;
			}
		}
		/**
		* Get OAuth endpoints for common authorities.
		*/
		getEndpointMetadataFromHardcodedValues() {
			if (this.hostnameAndPort in EndpointMetadata) return EndpointMetadata[this.hostnameAndPort];
			return null;
		}
		/**
		* Update the retrieved metadata with regional information.
		* User selected Azure region will be used if configured.
		*/
		async updateMetadataWithRegionalInformation(metadata) {
			const userConfiguredAzureRegion = this.authorityOptions.azureRegionConfiguration?.azureRegion;
			if (userConfiguredAzureRegion) {
				if (userConfiguredAzureRegion !== AZURE_REGION_AUTO_DISCOVER_FLAG) {
					this.regionDiscoveryMetadata.region_outcome = RegionDiscoveryOutcomes.CONFIGURED_NO_AUTO_DETECTION;
					this.regionDiscoveryMetadata.region_used = userConfiguredAzureRegion;
					return Authority.replaceWithRegionalInformation(metadata, userConfiguredAzureRegion, this.correlationId);
				}
				const autodetectedRegionName = await invokeAsync(this.regionDiscovery.detectRegion.bind(this.regionDiscovery), RegionDiscoveryDetectRegion, this.logger, this.performanceClient, this.correlationId)(this.authorityOptions.azureRegionConfiguration?.environmentRegion, this.regionDiscoveryMetadata);
				if (autodetectedRegionName) {
					this.regionDiscoveryMetadata.region_outcome = RegionDiscoveryOutcomes.AUTO_DETECTION_REQUESTED_SUCCESSFUL;
					this.regionDiscoveryMetadata.region_used = autodetectedRegionName;
					return Authority.replaceWithRegionalInformation(metadata, autodetectedRegionName, this.correlationId);
				}
				this.regionDiscoveryMetadata.region_outcome = RegionDiscoveryOutcomes.AUTO_DETECTION_REQUESTED_FAILED;
			}
			return metadata;
		}
		/**
		* Updates the AuthorityMetadataEntity with new aliases, preferred_network and preferred_cache
		* and returns where the information was retrieved from
		* @param metadataEntity
		* @returns AuthorityMetadataSource
		*/
		async updateCloudDiscoveryMetadata(metadataEntity) {
			const localMetadataSource = this.updateCloudDiscoveryMetadataFromLocalSources(metadataEntity);
			if (localMetadataSource) return localMetadataSource;
			const metadata = await invokeAsync(this.getCloudDiscoveryMetadataFromNetwork.bind(this), AuthorityGetCloudDiscoveryMetadataFromNetwork, this.logger, this.performanceClient, this.correlationId)();
			if (metadata) {
				updateCloudDiscoveryMetadata(metadataEntity, metadata, true);
				return AuthorityMetadataSource.NETWORK;
			}
			throw createClientConfigurationError(untrustedAuthority, this.correlationId);
		}
		updateCloudDiscoveryMetadataFromLocalSources(metadataEntity) {
			this.logger.verbose("Attempting to get cloud discovery metadata from authority configuration", this.correlationId);
			this.logger.verbosePii(`Known Authorities: '${this.authorityOptions.knownAuthorities || NOT_APPLICABLE}'`, this.correlationId);
			this.logger.verbosePii(`Authority Metadata: '${this.authorityOptions.authorityMetadata || NOT_APPLICABLE}'`, this.correlationId);
			this.logger.verbosePii(`Canonical Authority: '${metadataEntity.canonical_authority || NOT_APPLICABLE}'`, this.correlationId);
			const metadata = this.getCloudDiscoveryMetadataFromConfig();
			if (metadata) {
				this.logger.verbose("Found cloud discovery metadata in authority configuration", this.correlationId);
				updateCloudDiscoveryMetadata(metadataEntity, metadata, false);
				return AuthorityMetadataSource.CONFIG;
			}
			this.logger.verbose("Did not find cloud discovery metadata in the config... Attempting to get cloud discovery metadata from the hardcoded values.", this.correlationId);
			const hardcodedMetadata = getCloudDiscoveryMetadataFromHardcodedValues(this.hostnameAndPort);
			if (hardcodedMetadata) {
				this.logger.verbose("Found cloud discovery metadata from hardcoded values.", this.correlationId);
				updateCloudDiscoveryMetadata(metadataEntity, hardcodedMetadata, false);
				return AuthorityMetadataSource.HARDCODED_VALUES;
			}
			this.logger.verbose("Did not find cloud discovery metadata in hardcoded values... Attempting to get cloud discovery metadata from the network metadata cache.", this.correlationId);
			const metadataEntityExpired = isAuthorityMetadataExpired(metadataEntity);
			if (this.isAuthoritySameType(metadataEntity) && metadataEntity.aliasesFromNetwork && !metadataEntityExpired) {
				this.logger.verbose("Found cloud discovery metadata in the cache.", "");
				return AuthorityMetadataSource.CACHE;
			} else if (metadataEntityExpired) this.logger.verbose("The metadata entity is expired.", "");
			return null;
		}
		/**
		* Parse cloudDiscoveryMetadata config or check knownAuthorities
		*/
		getCloudDiscoveryMetadataFromConfig() {
			if (this.authorityType === AuthorityType.Ciam) {
				this.logger.verbose("CIAM authorities do not support cloud discovery metadata, generate the aliases from authority host.", this.correlationId);
				return Authority.createCloudDiscoveryMetadataFromHost(this.hostnameAndPort);
			}
			if (this.authorityOptions.cloudDiscoveryMetadata) {
				this.logger.verbose("The cloud discovery metadata has been provided as a network response, in the config.", this.correlationId);
				try {
					this.logger.verbose("Attempting to parse the cloud discovery metadata.", this.correlationId);
					const metadata = getCloudDiscoveryMetadataFromNetworkResponse(JSON.parse(this.authorityOptions.cloudDiscoveryMetadata).metadata, this.hostnameAndPort);
					this.logger.verbose("Parsed the cloud discovery metadata.", "");
					if (metadata) {
						this.logger.verbose("There is returnable metadata attached to the parsed cloud discovery metadata.", this.correlationId);
						return metadata;
					} else this.logger.verbose("There is no metadata attached to the parsed cloud discovery metadata.", this.correlationId);
				} catch (e) {
					this.logger.verbose("Unable to parse the cloud discovery metadata. Throwing Invalid Cloud Discovery Metadata Error.", this.correlationId);
					throw createClientConfigurationError(invalidCloudDiscoveryMetadata, this.correlationId);
				}
			}
			if (this.isInKnownAuthorities(this.hostnameAndPort)) {
				this.logger.verbose("The host is included in knownAuthorities. Creating new cloud discovery metadata from the host.", this.correlationId);
				return Authority.createCloudDiscoveryMetadataFromHost(this.hostnameAndPort);
			}
			return null;
		}
		/**
		* Called to get metadata from network if CloudDiscoveryMetadata was not populated by config
		*
		* @param hasHardcodedMetadata boolean
		*/
		async getCloudDiscoveryMetadataFromNetwork() {
			const instanceDiscoveryEndpoint = `${AAD_INSTANCE_DISCOVERY_ENDPT}${this.canonicalAuthority}oauth2/v2.0/authorize`;
			const options = {};
			let match = null;
			try {
				const response = await this.networkInterface.sendGetRequestAsync(instanceDiscoveryEndpoint, options);
				let typedResponseBody;
				let metadata;
				if (isCloudInstanceDiscoveryResponse(response.body)) {
					typedResponseBody = response.body;
					metadata = typedResponseBody.metadata;
					this.logger.verbosePii(`tenant_discovery_endpoint is: '${typedResponseBody.tenant_discovery_endpoint}'`, this.correlationId);
				} else if (isCloudInstanceDiscoveryErrorResponse(response.body)) {
					this.logger.warning(`A CloudInstanceDiscoveryErrorResponse was returned. The cloud instance discovery network request's status code is: '${response.status}'`, this.correlationId);
					typedResponseBody = response.body;
					if (typedResponseBody.error === INVALID_INSTANCE) {
						this.logger.error("The CloudInstanceDiscoveryErrorResponse error is invalid_instance.", this.correlationId);
						return null;
					}
					this.logger.warning(`The CloudInstanceDiscoveryErrorResponse error is '${typedResponseBody.error}'`, this.correlationId);
					this.logger.warning(`The CloudInstanceDiscoveryErrorResponse error description is '${typedResponseBody.error_description}'`, this.correlationId);
					this.logger.warning("Setting the value of the CloudInstanceDiscoveryMetadata (returned from the network, correlationId) to []", this.correlationId);
					metadata = [];
				} else {
					this.logger.error("AAD did not return a CloudInstanceDiscoveryResponse or CloudInstanceDiscoveryErrorResponse", this.correlationId);
					return null;
				}
				this.logger.verbose("Attempting to find a match between the developer's authority and the CloudInstanceDiscoveryMetadata returned from the network request.", this.correlationId);
				match = getCloudDiscoveryMetadataFromNetworkResponse(metadata, this.hostnameAndPort);
			} catch (error) {
				if (error instanceof AuthError) this.logger.error(`There was a network error while attempting to get the cloud discovery instance metadata.\nError: '${error.errorCode}'\nError Description: '${error.errorMessage}'`, this.correlationId);
				else {
					const typedError = error;
					this.logger.error(`A non-MSALJS error was thrown while attempting to get the cloud instance discovery metadata.\nError: '${typedError.name}'\nError Description: '${typedError.message}'`, this.correlationId);
				}
				return null;
			}
			if (!match) {
				this.logger.warning("The developer's authority was not found within the CloudInstanceDiscoveryMetadata returned from the network request.", this.correlationId);
				this.logger.verbose("Creating custom Authority for custom domain scenario.", this.correlationId);
				match = Authority.createCloudDiscoveryMetadataFromHost(this.hostnameAndPort);
			}
			return match;
		}
		/**
		* Helper function to determine if a host is included in the knownAuthorities config option.
		*/
		isInKnownAuthorities(host) {
			const normalizedHost = host.toLowerCase();
			return this.authorityOptions.knownAuthorities.filter((authority) => {
				return authority && UrlString.getDomainFromUrl(authority, this.correlationId).toLowerCase() === normalizedHost;
			}).length > 0;
		}
		/**
		* helper function to populate the authority based on azureCloudOptions
		* @param authorityString
		* @param azureCloudOptions
		*/
		static generateAuthority(authorityString, azureCloudOptions) {
			let authorityAzureCloudInstance;
			if (azureCloudOptions && azureCloudOptions.azureCloudInstance !== AzureCloudInstance.None) {
				const tenant = azureCloudOptions.tenant ? azureCloudOptions.tenant : DEFAULT_COMMON_TENANT;
				authorityAzureCloudInstance = `${azureCloudOptions.azureCloudInstance}/${tenant}/`;
			}
			return authorityAzureCloudInstance ? authorityAzureCloudInstance : authorityString;
		}
		/**
		* Creates cloud discovery metadata object from a given host
		* @param host
		*/
		static createCloudDiscoveryMetadataFromHost(host) {
			return {
				preferred_network: host,
				preferred_cache: host,
				aliases: [host]
			};
		}
		/**
		* helper function to generate environment from authority object
		*/
		getPreferredCache() {
			if (this.managedIdentity) return DEFAULT_AUTHORITY_HOST;
			else if (this.discoveryComplete()) return this.metadata.preferred_cache;
			else throw createClientAuthError(endpointResolutionError, this.correlationId);
		}
		/**
		* Returns whether or not the provided host is an alias of this authority instance
		* @param host
		*/
		isAlias(host) {
			return this.metadata.aliases.indexOf(host) > -1;
		}
		/**
		* Returns whether or not the provided host is an alias of a known Microsoft authority for purposes of endpoint discovery
		* @param host
		*/
		isAliasOfKnownMicrosoftAuthority(host) {
			return InstanceDiscoveryMetadataAliases.has(host);
		}
		/**
		* Validates the `issuer` returned by an OIDC discovery document against
		* this authority, per
		* https://openid.net/specs/openid-connect-discovery-1_0.html#ProviderConfigurationValidation
		*
		* The issuer is accepted when ANY of the following holds:
		*  1. The issuer scheme + host + port match the authority's (path may
		*     differ). Applies to all authorities.
		*  2. The authority is a Microsoft cloud authority (public, sovereign,
		*     or CIAM), the issuer is HTTPS, and the issuer host is in the known
		*     Microsoft authority host set.
		*  3. Same as (2), but the issuer host is a single-label regional variant
		*     of a known Microsoft host (e.g. `westus.login.microsoftonline.com`).
		*  4. Same as (2), but the issuer host matches the CIAM tenant pattern
		*     `{tenant}.ciamlogin.com` with an optional `/{tenant}[.onmicrosoft.com][/v2.0]`
		*     path.
		*  5. The issuer host is HTTPS and is explicitly listed in the
		*     developer-configured `knownAuthorities`. This covers scenarios where
		*     the OIDC discovery document returns an issuer host that differs from
		*     the authority (e.g., a GUID-based issuer for a name-based CIAM authority).
		*
		* @param issuer The `issuer` value returned in the OIDC discovery document.
		* @throws ClientConfigurationError("issuer_validation_failed") on failure.
		*/
		validateIssuer(issuer) {
			if (!issuer) throw createClientConfigurationError(issuerValidationFailed, this.correlationId);
			let issuerUrl;
			try {
				issuerUrl = new URL(issuer);
			} catch {
				throw createClientConfigurationError(issuerValidationFailed, this.correlationId);
			}
			const issuerScheme = issuerUrl.protocol;
			const issuerHost = issuerUrl.host;
			const authorityScheme = (this.canonicalAuthorityUrlComponents.Protocol || "").toLowerCase();
			const authorityHost = (this.canonicalAuthorityUrlComponents.HostNameAndPort || "").toLowerCase();
			const matchesAuthorityOrigin = this.matchesAuthorityOrigin(issuerScheme, issuerHost, authorityScheme, authorityHost);
			const matchesKnownMicrosoftHost = issuerScheme === "https:" && this.isAliasOfKnownMicrosoftAuthority(issuerHost);
			const matchesRegionalMicrosoftHost = issuerScheme === "https:" && this.matchesRegionalMicrosoftHost(issuerHost);
			const matchesCiamTenantPattern = this.matchesCiamTenantPattern(issuerUrl, authorityHost, this.canonicalAuthorityUrlComponents.PathSegments);
			const matchesKnownAuthority = issuerScheme === "https:" && this.isInKnownAuthorities(issuerHost);
			if (matchesAuthorityOrigin || matchesKnownMicrosoftHost || matchesRegionalMicrosoftHost || matchesCiamTenantPattern || matchesKnownAuthority) return;
			throw createClientConfigurationError(issuerValidationFailed, this.correlationId);
		}
		/**
		* Rule 1: The issuer scheme + host (and port) match the authority's. Path
		* may differ. Applies to all authorities.
		*/
		matchesAuthorityOrigin(issuerScheme, issuerHost, authorityScheme, authorityHost) {
			return issuerScheme === authorityScheme && issuerHost === authorityHost;
		}
		/**
		* Rule 3: The issuer host is a regional variant
		* (`{region}.{host}`) of a known Microsoft authority host.
		* E.g. `westus2.login.microsoft.com`.
		*/
		matchesRegionalMicrosoftHost(issuerHost) {
			const firstDot = issuerHost.indexOf(".");
			if (firstDot > 0 && firstDot < issuerHost.length - 1) {
				const hostWithoutRegion = issuerHost.substring(firstDot + 1);
				return this.isAliasOfKnownMicrosoftAuthority(hostWithoutRegion);
			}
			return false;
		}
		/**
		* Rule 4: The issuer matches one of the well-known CIAM tenant patterns
		* (`https://{tenant}.ciamlogin.com[/{tenant}[.onmicrosoft.com][/v2.0]]`).
		*
		* The bare tenant name is extracted from the authority's first path segment
		* when available (stripping the `.onmicrosoft.com` suffix that
		* `transformCIAMAuthority` adds), or otherwise from the leftmost label of
		* the authority host (to support CIAM custom domain scenarios).
		*
		* Both `/{tenant}` and `/{tenant}.onmicrosoft.com` path forms are accepted
		* because the OIDC issuer may use either form depending on the authority URL
		* that was used to trigger discovery.
		*/
		matchesCiamTenantPattern(issuerUrl, authorityHost, authorityPathSegments) {
			const pathSegment = authorityPathSegments[0];
			const tenantName = pathSegment ? pathSegment.endsWith(AAD_TENANT_DOMAIN_SUFFIX) ? pathSegment.slice(0, -16) : pathSegment : authorityHost.split(".")[0];
			if (!tenantName) return false;
			const ciamBaseURL = `https://${tenantName}${CIAM_AUTH_URL}`;
			const validCiamPatterns = [
				ciamBaseURL,
				`${ciamBaseURL}/${tenantName}`,
				`${ciamBaseURL}/${tenantName}/v2.0`,
				`${ciamBaseURL}/${tenantName}${AAD_TENANT_DOMAIN_SUFFIX}`,
				`${ciamBaseURL}/${tenantName}${AAD_TENANT_DOMAIN_SUFFIX}/v2.0`
			];
			const issuerPath = issuerUrl.pathname.replace(/\/+$/, "");
			const normalizedIssuer = `${issuerUrl.protocol}//${issuerUrl.host}${issuerPath}`;
			return validCiamPatterns.some((pattern) => pattern === normalizedIssuer);
		}
		/**
		* Checks whether the provided host is that of a public cloud authority
		*
		* @param authority string
		* @returns bool
		*/
		static isPublicCloudAuthority(host) {
			return KNOWN_PUBLIC_CLOUDS.indexOf(host) >= 0;
		}
		/**
		* Rebuild the authority string with the region
		*
		* @param host string
		* @param region string
		*/
		static buildRegionalAuthorityString(host, region, correlationId, queryString) {
			const authorityUrlInstance = new UrlString(host, correlationId);
			authorityUrlInstance.validateAsUri();
			const authorityUrlParts = authorityUrlInstance.getUrlComponents();
			let hostNameAndPort = `${region}.${authorityUrlParts.HostNameAndPort}`;
			if (this.isPublicCloudAuthority(authorityUrlParts.HostNameAndPort)) hostNameAndPort = `${region}.${REGIONAL_AUTH_PUBLIC_CLOUD_SUFFIX}`;
			const url = UrlString.constructAuthorityUriFromObject({
				...authorityUrlInstance.getUrlComponents(),
				HostNameAndPort: hostNameAndPort
			}, correlationId).urlString;
			if (queryString) return `${url}?${queryString}`;
			return url;
		}
		/**
		* Replace the endpoints in the metadata object with their regional equivalents.
		*
		* @param metadata OpenIdConfigResponse
		* @param azureRegion string
		*/
		static replaceWithRegionalInformation(metadata, azureRegion, correlationId) {
			const regionalMetadata = { ...metadata };
			regionalMetadata.authorization_endpoint = Authority.buildRegionalAuthorityString(regionalMetadata.authorization_endpoint, azureRegion, correlationId);
			regionalMetadata.token_endpoint = Authority.buildRegionalAuthorityString(regionalMetadata.token_endpoint, azureRegion, correlationId);
			if (regionalMetadata.end_session_endpoint) regionalMetadata.end_session_endpoint = Authority.buildRegionalAuthorityString(regionalMetadata.end_session_endpoint, azureRegion, correlationId);
			return regionalMetadata;
		}
		/**
		* Transform CIAM_AUTHORIY as per the below rules:
		* If no path segments found and it is a CIAM authority (hostname ends with .ciamlogin.com), then transform it
		*
		* NOTE: The transformation path should go away once STS supports CIAM with the format: `tenantIdorDomain.ciamlogin.com`
		* `ciamlogin.com` can also change in the future and we should accommodate the same
		*
		* @param authority
		*/
		static transformCIAMAuthority(authority, correlationId) {
			let ciamAuthority = authority;
			const authorityUrlComponents = new UrlString(authority, correlationId).getUrlComponents();
			if (authorityUrlComponents.PathSegments.length === 0 && authorityUrlComponents.HostNameAndPort.endsWith(CIAM_AUTH_URL)) {
				const tenantIdOrDomain = authorityUrlComponents.HostNameAndPort.split(".")[0];
				ciamAuthority = `${ciamAuthority}${tenantIdOrDomain}${AAD_TENANT_DOMAIN_SUFFIX}`;
			}
			return ciamAuthority;
		}
	};
	Authority.reservedTenantDomains = new Set([
		"{tenant}",
		"{tenantid}",
		AADAuthority.COMMON,
		AADAuthority.CONSUMERS,
		AADAuthority.ORGANIZATIONS
	]);
	/**
	* Extract tenantId from authority
	*/
	function getTenantFromAuthorityString(authority, correlationId) {
		/**
		* For credential matching purposes, tenantId is the last path segment of the authority URL:
		*  AAD Authority - domain/tenantId -> Credentials are cached with realm = tenantId
		*  B2C Authority - domain/{tenantId}?/.../policy -> Credentials are cached with realm = policy
		*  tenantId is downcased because B2C policies can have mixed case but tfp claim is downcased
		*
		* Note that we may not have any path segments in certain OIDC scenarios.
		*/
		const tenantId = new UrlString(authority, correlationId).getUrlComponents().PathSegments.slice(-1)[0]?.toLowerCase();
		switch (tenantId) {
			case AADAuthority.COMMON:
			case AADAuthority.ORGANIZATIONS:
			case AADAuthority.CONSUMERS: return;
			default: return tenantId;
		}
	}
	function formatAuthorityUri(authorityUri) {
		return authorityUri.endsWith(FORWARD_SLASH) ? authorityUri : `${authorityUri}${FORWARD_SLASH}`;
	}
	function buildStaticAuthorityOptions(authOptions) {
		const rawCloudDiscoveryMetadata = authOptions.cloudDiscoveryMetadata;
		let cloudDiscoveryMetadata = void 0;
		if (rawCloudDiscoveryMetadata) try {
			cloudDiscoveryMetadata = JSON.parse(rawCloudDiscoveryMetadata);
		} catch (e) {
			throw createClientConfigurationError(invalidCloudDiscoveryMetadata, "");
		}
		return {
			canonicalAuthority: authOptions.authority ? formatAuthorityUri(authOptions.authority) : void 0,
			knownAuthorities: authOptions.knownAuthorities,
			cloudDiscoveryMetadata
		};
	}
	/*! @azure/msal-common v16.14.3 2026-10-21 */
	/**
	* Create an authority object of the correct type based on the url
	* Performs basic authority validation - checks to see if the authority is of a valid type (i.e. aad, b2c, adfs)
	*
	* Also performs endpoint discovery.
	*
	* @param authorityUri
	* @param networkClient
	* @param cacheManager
	* @param authorityOptions
	* @param logger
	* @param correlationId
	* @param performanceClient
	* @internal
	*/
	async function createDiscoveredInstance(authorityUri, networkClient, cacheManager, authorityOptions, logger, correlationId, performanceClient) {
		const acquireTokenAuthority = new Authority(Authority.transformCIAMAuthority(formatAuthorityUri(authorityUri), correlationId), networkClient, cacheManager, authorityOptions, logger, correlationId, performanceClient);
		try {
			await invokeAsync(acquireTokenAuthority.resolveEndpointsAsync.bind(acquireTokenAuthority), AuthorityResolveEndpointsAsync, logger, performanceClient, correlationId)();
			return acquireTokenAuthority;
		} catch (e) {
			throw createClientAuthError(endpointResolutionError, correlationId);
		}
	}
	/*! @azure/msal-common v16.14.3 2026-10-21 */
	/**
	* The ScopeSet class creates a set of scopes. Scopes are case-insensitive, unique values, so the Set object in JS makes
	* the most sense to implement for this class. All scopes are trimmed and converted to lower case strings in intersection and union functions
	* to ensure uniqueness of strings.
	*/
	var ScopeSet = class ScopeSet {
		constructor(inputScopes, correlationId) {
			this.correlationId = correlationId;
			const scopeArr = inputScopes ? StringUtils.trimArrayEntries([...inputScopes]) : [];
			const filteredInput = scopeArr ? StringUtils.removeEmptyStringsFromArray(scopeArr) : [];
			if (!filteredInput || !filteredInput.length) throw createClientConfigurationError(emptyInputScopesError, correlationId);
			this.scopes = /* @__PURE__ */ new Set();
			filteredInput.forEach((scope) => this.scopes.add(scope));
		}
		/**
		* Factory method to create ScopeSet from space-delimited string
		* @param inputScopeString
		* @param appClientId
		* @param scopesRequired
		*/
		static fromString(inputScopeString, correlationId) {
			return new ScopeSet((inputScopeString || "").split(" "), correlationId);
		}
		/**
		* Creates the set of scopes to search for in cache lookups
		* @param inputScopeString
		* @returns
		*/
		static createSearchScopes(inputScopeString, correlationId) {
			const scopeSet = new ScopeSet(inputScopeString && inputScopeString.length > 0 ? inputScopeString : [...OIDC_DEFAULT_SCOPES], correlationId);
			if (!scopeSet.containsOnlyOIDCScopes()) scopeSet.removeOIDCScopes();
			else scopeSet.removeScope(OFFLINE_ACCESS_SCOPE);
			return scopeSet;
		}
		/**
		* Check if a given scope is present in this set of scopes.
		* @param scope
		*/
		containsScope(scope) {
			const lowerCaseScopesSet = new ScopeSet(this.printScopesLowerCase().split(" "), this.correlationId);
			return scope ? lowerCaseScopesSet.scopes.has(scope.toLowerCase()) : false;
		}
		/**
		* Check if a set of scopes is present in this set of scopes.
		* @param scopeSet
		*/
		containsScopeSet(scopeSet) {
			if (!scopeSet || scopeSet.scopes.size <= 0) return false;
			return this.scopes.size >= scopeSet.scopes.size && scopeSet.asArray().every((scope) => this.containsScope(scope));
		}
		/**
		* Check if set of scopes contains only the defaults
		*/
		containsOnlyOIDCScopes() {
			let defaultScopeCount = 0;
			OIDC_SCOPES.forEach((defaultScope) => {
				if (this.containsScope(defaultScope)) defaultScopeCount += 1;
			});
			return this.scopes.size === defaultScopeCount;
		}
		/**
		* Appends single scope if passed
		* @param newScope
		*/
		appendScope(newScope) {
			if (newScope) this.scopes.add(newScope.trim());
		}
		/**
		* Appends multiple scopes if passed
		* @param newScopes
		*/
		appendScopes(newScopes) {
			try {
				newScopes.forEach((newScope) => this.appendScope(newScope));
			} catch (e) {
				throw createClientAuthError(cannotAppendScopeSet, this.correlationId);
			}
		}
		/**
		* Removes element from set of scopes.
		* @param scope
		*/
		removeScope(scope) {
			if (!scope) throw createClientAuthError(cannotRemoveEmptyScope, this.correlationId);
			this.scopes.delete(scope.trim());
		}
		/**
		* Removes default scopes from set of scopes
		* Primarily used to prevent cache misses if the default scopes are not returned from the server
		*/
		removeOIDCScopes() {
			OIDC_SCOPES.forEach((defaultScope) => {
				this.scopes.delete(defaultScope);
			});
		}
		/**
		* Combines an array of scopes with the current set of scopes.
		* @param otherScopes
		*/
		unionScopeSets(otherScopes) {
			if (!otherScopes) throw createClientAuthError(emptyInputScopeSet, this.correlationId);
			const unionScopes = /* @__PURE__ */ new Set();
			otherScopes.scopes.forEach((scope) => unionScopes.add(scope.toLowerCase()));
			this.scopes.forEach((scope) => unionScopes.add(scope.toLowerCase()));
			return unionScopes;
		}
		/**
		* Check if scopes intersect between this set and another.
		* @param otherScopes
		*/
		intersectingScopeSets(otherScopes) {
			if (!otherScopes) throw createClientAuthError(emptyInputScopeSet, this.correlationId);
			if (!otherScopes.containsOnlyOIDCScopes()) otherScopes.removeOIDCScopes();
			const unionScopes = this.unionScopeSets(otherScopes);
			const sizeOtherScopes = otherScopes.getScopeCount();
			const sizeThisScopes = this.getScopeCount();
			return unionScopes.size < sizeThisScopes + sizeOtherScopes;
		}
		/**
		* Returns size of set of scopes.
		*/
		getScopeCount() {
			return this.scopes.size;
		}
		/**
		* Returns the scopes as an array of string values
		*/
		asArray() {
			const array = [];
			this.scopes.forEach((val) => array.push(val));
			return array;
		}
		/**
		* Prints scopes into a space-delimited string
		*/
		printScopes() {
			if (this.scopes) return this.asArray().join(" ");
			return "";
		}
		/**
		* Prints scopes into a space-delimited lower-case string (used for caching)
		*/
		printScopesLowerCase() {
			return this.printScopes().toLowerCase();
		}
	};
	/*! @azure/msal-common v16.14.3 2026-10-21 */
	function instrumentBrokerParams(parameters, correlationId, performanceClient) {
		if (!correlationId) return;
		const clientId = parameters.get(CLIENT_ID);
		if (clientId && parameters.has(BROKER_CLIENT_ID)) performanceClient?.addFields({
			embeddedClientId: clientId,
			embeddedRedirectUri: parameters.get(REDIRECT_URI)
		}, correlationId);
	}
	/**
	* Add the given response_type
	* @param parameters
	* @param responseType
	*/
	function addResponseType(parameters, responseType) {
		parameters.set(RESPONSE_TYPE, responseType);
	}
	/**
	* add response_mode. defaults to query.
	* @param responseMode
	*/
	function addResponseMode(parameters, responseMode) {
		parameters.set(RESPONSE_MODE, responseMode ? responseMode : ResponseMode$1.QUERY);
	}
	/**
	* add scopes. set addOidcScopes to false to prevent default scopes in non-user scenarios
	* @param scopeSet
	* @param addOidcScopes
	*/
	function addScopes(parameters, scopes, correlationId, addOidcScopes = true, defaultScopes = OIDC_DEFAULT_SCOPES) {
		if (addOidcScopes && !defaultScopes.includes("openid") && !scopes.includes("openid")) defaultScopes.push("openid");
		const scopeSet = new ScopeSet(addOidcScopes ? [...scopes || [], ...defaultScopes] : scopes || [], correlationId);
		parameters.set(SCOPE, scopeSet.printScopes());
	}
	/**
	* add clientId
	* @param clientId
	*/
	function addClientId(parameters, clientId) {
		parameters.set(CLIENT_ID, clientId);
	}
	/**
	* add redirect_uri
	* @param redirectUri
	*/
	function addRedirectUri(parameters, redirectUri) {
		parameters.set(REDIRECT_URI, redirectUri);
	}
	/**
	* add post logout redirectUri
	* @param redirectUri
	*/
	function addPostLogoutRedirectUri(parameters, redirectUri) {
		parameters.set(POST_LOGOUT_URI, redirectUri);
	}
	/**
	* add id_token_hint to logout request
	* @param idTokenHint
	*/
	function addIdTokenHint(parameters, idTokenHint) {
		parameters.set(ID_TOKEN_HINT, idTokenHint);
	}
	/**
	* add domain_hint
	* @param domainHint
	*/
	function addDomainHint(parameters, domainHint) {
		parameters.set(DOMAIN_HINT, domainHint);
	}
	/**
	* add login_hint
	* @param loginHint
	*/
	function addLoginHint(parameters, loginHint) {
		parameters.set(LOGIN_HINT, loginHint);
	}
	/**
	* Adds the CCS (Cache Credential Service) query parameter for login_hint
	* @param loginHint
	*/
	function addCcsUpn(parameters, loginHint) {
		parameters.set(HeaderNames.CCS_HEADER, `UPN:${loginHint}`);
	}
	/**
	* Adds the CCS (Cache Credential Service) query parameter for account object
	* @param loginHint
	*/
	function addCcsOid(parameters, clientInfo) {
		parameters.set(HeaderNames.CCS_HEADER, `Oid:${clientInfo.uid}@${clientInfo.utid}`);
	}
	/**
	* add sid
	* @param sid
	*/
	function addSid(parameters, sid) {
		parameters.set(SID, sid);
	}
	/**
	* Adds claims to request parameters, conditionally excluding clientCapabilities
	* when skipBrokerClaims is true and a brokered flow is in effect.
	* @param parameters - The request parameters map
	* @param correlationId - The request correlation id
	* @param claims - The claims string from the request
	* @param clientCapabilities - The client capabilities from configuration
	* @param skipBrokerClaims - When true and BROKER_CLIENT_ID is present, excludes clientCapabilities from claims
	* @param claimsToMerge - Optional client-originated claims JSON string (e.g. `claimsFromClient`) deep-merged into `claims` with precedence on conflicts
	*/
	function addClaims(parameters, correlationId, claims, clientCapabilities, skipBrokerClaims, claimsToMerge) {
		const mergedClaims = buildMergedClaims(claims, skipBrokerClaims && parameters.has(BROKER_CLIENT_ID) ? void 0 : clientCapabilities, correlationId, claimsToMerge);
		parameters.set(CLAIMS, mergedClaims);
	}
	/**
	* add correlationId
	* @param correlationId
	*/
	function addCorrelationId(parameters, correlationId) {
		parameters.set(CLIENT_REQUEST_ID, correlationId);
	}
	/**
	* add library info query params
	* @param libraryInfo
	*/
	function addLibraryInfo(parameters, libraryInfo) {
		parameters.set(X_CLIENT_SKU, libraryInfo.sku);
		parameters.set(X_CLIENT_VER, libraryInfo.version);
		if (libraryInfo.os) parameters.set(X_CLIENT_OS, libraryInfo.os);
		if (libraryInfo.cpu) parameters.set(X_CLIENT_CPU, libraryInfo.cpu);
	}
	/**
	* Add client telemetry parameters
	* @param appTelemetry
	*/
	function addApplicationTelemetry(parameters, appTelemetry) {
		if (appTelemetry?.appName) parameters.set(X_APP_NAME, appTelemetry.appName);
		if (appTelemetry?.appVersion) parameters.set(X_APP_VER, appTelemetry.appVersion);
	}
	/**
	* add prompt
	* @param prompt
	*/
	function addPrompt(parameters, prompt) {
		parameters.set(PROMPT, prompt);
	}
	/**
	* add state
	* @param state
	*/
	function addState(parameters, state) {
		if (state) parameters.set(STATE, state);
	}
	/**
	* add nonce
	* @param nonce
	*/
	function addNonce(parameters, nonce) {
		parameters.set(NONCE, nonce);
	}
	/**
	* add code_challenge and code_challenge_method
	* - throw if either of them are not passed
	* @param codeChallenge
	* @param codeChallengeMethod
	*/
	function addCodeChallengeParams(parameters, codeChallenge, codeChallengeMethod) {
		if (codeChallenge && codeChallengeMethod) {
			parameters.set(CODE_CHALLENGE, codeChallenge);
			parameters.set(CODE_CHALLENGE_METHOD, codeChallengeMethod);
		} else throw createClientConfigurationError(pkceParamsMissing, "");
	}
	/**
	* add the `authorization_code` passed by the user to exchange for a token
	* @param code
	*/
	function addAuthorizationCode(parameters, code) {
		parameters.set(CODE, code);
	}
	/**
	* add the `authorization_code` passed by the user to exchange for a token
	* @param code
	*/
	function addDeviceCode(parameters, code) {
		parameters.set(DEVICE_CODE, code);
	}
	/**
	* add the `refreshToken` passed by the user
	* @param refreshToken
	*/
	function addRefreshToken(parameters, refreshToken) {
		parameters.set(REFRESH_TOKEN, refreshToken);
	}
	/**
	* add the `code_verifier` passed by the user to exchange for a token
	* @param codeVerifier
	*/
	function addCodeVerifier(parameters, codeVerifier) {
		parameters.set(CODE_VERIFIER, codeVerifier);
	}
	/**
	* add client_secret
	* @param clientSecret
	*/
	function addClientSecret(parameters, clientSecret) {
		parameters.set(CLIENT_SECRET, clientSecret);
	}
	/**
	* add clientAssertion for confidential client flows
	* @param clientAssertion
	*/
	function addClientAssertion(parameters, clientAssertion) {
		if (clientAssertion) parameters.set(CLIENT_ASSERTION, clientAssertion);
	}
	/**
	* add clientAssertionType for confidential client flows
	* @param clientAssertionType
	*/
	function addClientAssertionType(parameters, clientAssertionType) {
		if (clientAssertionType) parameters.set(CLIENT_ASSERTION_TYPE, clientAssertionType);
	}
	/**
	* add OBO assertion for confidential client flows
	* @param clientAssertion
	*/
	function addOboAssertion(parameters, oboAssertion) {
		parameters.set(OBO_ASSERTION, oboAssertion);
	}
	/**
	* add grant type
	* @param grantType
	*/
	function addRequestTokenUse(parameters, tokenUse) {
		parameters.set(REQUESTED_TOKEN_USE, tokenUse);
	}
	/**
	* add grant type
	* @param grantType
	*/
	function addGrantType(parameters, grantType) {
		parameters.set(GRANT_TYPE, grantType);
	}
	/**
	* add client info
	*
	*/
	function addClientInfo(parameters) {
		parameters.set(CLIENT_INFO, "1");
	}
	/**
	* add clidata=1 to request to indicate client data support
	*/
	function addCliData(parameters) {
		parameters.set(CLI_DATA, "1");
	}
	function addInstanceAware(parameters) {
		if (!parameters.has(INSTANCE_AWARE)) parameters.set(INSTANCE_AWARE, "true");
	}
	/**
	* Add extraParameters
	* @param extraParams - String dictionary containing extra parameters to be added.
	*/
	function addExtraParameters(parameters, extraParams) {
		Object.entries(extraParams).forEach(([key, value]) => {
			if (!parameters.has(key) && value) parameters.set(key, value);
		});
	}
	/**
	* Default optional idToken claims requested on all auth requests.
	* signin_state enables KMSI detection; login_hint enables login hint propagation;
	* tenant_region_sub_scope identifies the sovereign enclave a tenant belongs to.
	*/
	const DEFAULT_ID_TOKEN_CLAIMS = {
		[ClaimsRequestKeys.SIGNIN_STATE]: { essential: false },
		[ClaimsRequestKeys.LOGIN_HINT]: { essential: false },
		[ClaimsRequestKeys.TENANT_REGION_SUB_SCOPE]: { essential: false }
	};
	/**
	* Parses a claims JSON string into an object, throwing a ClientConfigurationError
	* (error code `invalid_claims`) if the value is not a valid JSON object. The raw
	* claims value is never included in the error - it may contain sensitive data.
	* @param claims - Claims JSON string. Must be valid JSON representing an object.
	* @param correlationId - The request correlation id
	* @returns The parsed claims object
	*/
	function parseClaims(claims, correlationId = "") {
		let parsed;
		try {
			parsed = JSON.parse(claims);
		} catch (e) {
			throw createClientConfigurationError(invalidClaims, correlationId);
		}
		if (!isPlainObject$1(parsed)) throw createClientConfigurationError(invalidClaims, correlationId);
		return parsed;
	}
	/**
	* Type guard for a non-null, non-array object (a JSON "object" value).
	* @param value - The value to test
	* @returns True when value is a plain object that can be deep-merged
	*/
	function isPlainObject$1(value) {
		return typeof value === "object" && value !== null && !Array.isArray(value);
	}
	/**
	* Recursively deep-merges two parsed claims objects. Nested objects are merged key-by-key;
	* for any other value type (arrays, scalars, null) the value from `claimsToMerge` replaces
	* the base. This mirrors the deep merge used by msal-dotnet so that, for example, a server
	* `access_token` challenge and a client-originated `access_token` claim are combined rather
	* than one clobbering the other.
	* @param baseClaims - The parsed base claims object
	* @param claimsToMerge - The parsed claims object merged in with precedence
	* @returns The deep-merged claims object
	*/
	function deepMergeClaims(baseClaims, claimsToMerge) {
		const merged = { ...baseClaims };
		for (const [key, mergeInValue] of Object.entries(claimsToMerge)) {
			const baseValue = merged[key];
			if (isPlainObject$1(baseValue) && isPlainObject$1(mergeInValue)) merged[key] = deepMergeClaims(baseValue, mergeInValue);
			else merged[key] = mergeInValue;
		}
		return merged;
	}
	/**
	* Parses claims JSON, optionally deep-merges a second client-originated claims string
	* (`claimsToMerge`, e.g. `claimsFromClient`) with precedence on conflicting keys, merges
	* default optional idToken claims (signin_state, login_hint, tenant_region_sub_scope), and appends client
	* capabilities (xms_cc) to the access_token section
	* Does not overwrite idToken claims already specified by the caller.
	* @param claims - Existing claims JSON string from the request (may be undefined)
	* @param clientCapabilities - Client capabilities array from configuration
	* @param correlationId - The request correlation id
	* @param claimsToMerge - Optional second claims JSON string (e.g. client-originated `claimsFromClient`)
	* deep-merged into `claims` with precedence on conflicts; parsed and validated when present. Nested
	* objects are merged recursively; arrays and scalar values are replaced.
	* @returns Merged claims JSON string
	*/
	function buildMergedClaims(claims, clientCapabilities, correlationId = "", claimsToMerge) {
		let mergedClaims = claims ? parseClaims(claims, correlationId) : {};
		if (claimsToMerge?.trim()) mergedClaims = deepMergeClaims(mergedClaims, parseClaims(claimsToMerge, correlationId));
		if (!Object.prototype.hasOwnProperty.call(mergedClaims, ClaimsRequestKeys.ID_TOKEN)) mergedClaims[ClaimsRequestKeys.ID_TOKEN] = {};
		const idTokenClaims = mergedClaims[ClaimsRequestKeys.ID_TOKEN];
		for (const [key, value] of Object.entries(DEFAULT_ID_TOKEN_CLAIMS)) if (!(key in idTokenClaims)) idTokenClaims[key] = value;
		if (clientCapabilities && clientCapabilities.length > 0) {
			if (!Object.prototype.hasOwnProperty.call(mergedClaims, ClaimsRequestKeys.ACCESS_TOKEN)) mergedClaims[ClaimsRequestKeys.ACCESS_TOKEN] = {};
			mergedClaims[ClaimsRequestKeys.ACCESS_TOKEN][ClaimsRequestKeys.XMS_CC] = { values: clientCapabilities };
		}
		return JSON.stringify(mergedClaims);
	}
	/**
	* adds `username` for Password Grant flow
	* @param username
	*/
	function addUsername(parameters, username) {
		parameters.set(PasswordGrantConstants.username, username);
	}
	/**
	* adds `password` for Password Grant flow
	* @param password
	*/
	function addPassword(parameters, password) {
		parameters.set(PasswordGrantConstants.password, password);
	}
	/**
	* add pop_jwk to query params
	* @param cnfString
	*/
	function addPopToken(parameters, cnfString) {
		if (cnfString) {
			parameters.set(TOKEN_TYPE, AuthenticationScheme.POP);
			parameters.set(REQ_CNF, cnfString);
		}
	}
	/**
	* add SSH JWK and key ID to query params
	*/
	function addSshJwk(parameters, sshJwkString) {
		if (sshJwkString) {
			parameters.set(TOKEN_TYPE, AuthenticationScheme.SSH);
			parameters.set(REQ_CNF, sshJwkString);
		}
	}
	/**
	* add server telemetry fields
	* @param serverTelemetryManager
	* @internal
	*/
	function addServerTelemetry(parameters, serverTelemetryManager) {
		parameters.set(X_CLIENT_CURR_TELEM, serverTelemetryManager.generateCurrentRequestHeaderValue());
		parameters.set(X_CLIENT_LAST_TELEM, serverTelemetryManager.generateLastRequestHeaderValue());
	}
	/**
	* Adds parameter that indicates to the server that throttling is supported
	*/
	function addThrottling(parameters) {
		parameters.set(X_MS_LIB_CAPABILITY, X_MS_LIB_CAPABILITY_VALUE);
	}
	/**
	* Adds logout_hint parameter for "silent" logout which prevent server account picker
	*/
	function addLogoutHint(parameters, logoutHint) {
		parameters.set(LOGOUT_HINT, logoutHint);
	}
	function addBrokerParameters(parameters, brokerClientId, brokerRedirectUri) {
		if (!parameters.has(BROKER_CLIENT_ID)) parameters.set(BROKER_CLIENT_ID, brokerClientId);
		if (!parameters.has(BROKER_REDIRECT_URI)) parameters.set(BROKER_REDIRECT_URI, brokerRedirectUri);
	}
	function addResource(parameters, resource) {
		if (resource) parameters.set(RESOURCE, resource);
	}
	/**
	* Add the `attribute_tokens` parameter to a /token request body.
	*
	* When `attributeTokens` is a non-empty array the values are sorted lexicographically and joined
	* with a single space, then written to the request body. When `attributeTokens` is an empty array
	* the parameter is deleted from the request body.
	*
	* @param parameters - request parameter map that will be serialized into the /token body
	* @param attributeTokens - caller-provided attribute token strings
	*/
	function addAttributeTokens(parameters, attributeTokens) {
		const serialized = serializeAttributeTokens(attributeTokens);
		if (serialized) parameters.set(ATTRIBUTE_TOKENS, serialized);
		else parameters.delete(ATTRIBUTE_TOKENS);
	}
	/*! @azure/msal-common v16.14.3 2026-10-21 */
	/**
	* Parses hash string from given string. Returns empty string if no hash symbol is found.
	* @param hashString
	*/
	function stripLeadingHashOrQuery(responseString) {
		if (responseString.startsWith("#/")) return responseString.substring(2);
		else if (responseString.startsWith("#") || responseString.startsWith("?")) return responseString.substring(1);
		return responseString;
	}
	/**
	* Returns URL hash as server auth code response object.
	*/
	function getDeserializedResponse(responseString) {
		if (!responseString || responseString.indexOf("=") < 0) return null;
		try {
			const normalizedResponse = stripLeadingHashOrQuery(responseString);
			const deserializedHash = Object.fromEntries(new URLSearchParams(normalizedResponse));
			if (deserializedHash.code || deserializedHash.ear_jwe || deserializedHash.error || deserializedHash.error_description || deserializedHash.state) return deserializedHash;
		} catch (e) {
			throw createClientAuthError(hashNotDeserialized, "");
		}
		return null;
	}
	/**
	* Utility to create a URL from the params map
	*/
	function mapToQueryString(parameters) {
		const queryParameterArray = new Array();
		parameters.forEach((value, key) => {
			queryParameterArray.push(`${key}=${encodeURIComponent(value)}`);
		});
		return queryParameterArray.join("&");
	}
	/*! @azure/msal-common v16.14.3 2026-10-21 */
	/**
	* Shared JOSE algorithm literals used by MSAL package internals.
	* @internal
	*/
	const JsonWebTokenAlgorithms = {
		ES256: "ES256",
		RS256: "RS256"
	};
	/**
	* Default crypto implementation used when a platform-specific implementation has
	* not been provided.
	*/
	const DEFAULT_CRYPTO_IMPLEMENTATION = {
		createNewGuid: () => {
			throw createClientAuthError(methodNotImplemented, "");
		},
		base64Decode: () => {
			throw createClientAuthError(methodNotImplemented, "");
		},
		base64Encode: () => {
			throw createClientAuthError(methodNotImplemented, "");
		},
		base64UrlEncode: () => {
			throw createClientAuthError(methodNotImplemented, "");
		},
		encodeKid: () => {
			throw createClientAuthError(methodNotImplemented, "");
		},
		async removeTokenBindingKey(kid, correlationId) {
			throw createClientAuthError(methodNotImplemented, correlationId);
		},
		async clearKeystore(correlationId) {
			throw createClientAuthError(methodNotImplemented, correlationId);
		},
		async signTokenBindingJwt(header, payload, kid, correlationId) {
			throw createClientAuthError(methodNotImplemented, correlationId);
		},
		async hashString() {
			throw createClientAuthError(methodNotImplemented, "");
		}
	};
	/*! @azure/msal-common v16.14.3 2026-10-21 */
	/**
	* Default token-binding key manager used when a platform-specific implementation
	* has not been provided.
	* @internal
	*/
	const DEFAULT_TOKEN_BINDING_KEY_MANAGER = {
		async provisionTokenBindingKey(request) {
			throw createClientAuthError(methodNotImplemented, request.correlationId);
		},
		async removeTokenBindingKey(_kid, correlationId) {
			throw createClientAuthError(methodNotImplemented, correlationId);
		},
		async getTokenBindingPublicKeyJwk(_kid, correlationId) {
			throw createClientAuthError(methodNotImplemented, correlationId);
		}
	};
	/*! @azure/msal-common v16.14.3 2026-10-21 */
	/**
	* Log message level.
	*/
	exports.LogLevel = void 0;
	(function(LogLevel) {
		LogLevel[LogLevel["Error"] = 0] = "Error";
		LogLevel[LogLevel["Warning"] = 1] = "Warning";
		LogLevel[LogLevel["Info"] = 2] = "Info";
		LogLevel[LogLevel["Verbose"] = 3] = "Verbose";
		LogLevel[LogLevel["Trace"] = 4] = "Trace";
	})(exports.LogLevel || (exports.LogLevel = {}));
	const CACHE_CAPACITY = 50;
	const MAX_LOGS_PER_CORRELATION = 500;
	const correlationCache = /* @__PURE__ */ new Map();
	/**
	* Mark correlation ID as recently used by moving it to end of Map
	* @param correlationId
	* @param {CorrelationLogData} data
	*/
	function markAsRecentlyUsed(correlationId, data) {
		correlationCache.delete(correlationId);
		correlationCache.set(correlationId, data);
	}
	/**
	* Add log message to cache for specific correlation ID
	* @param correlationId
	* @param {LoggedMessage} loggedMessage
	*/
	function addLogToCache(correlationId, loggedMessage) {
		const currentTime = Date.now();
		let data = correlationCache.get(correlationId);
		if (data) markAsRecentlyUsed(correlationId, data);
		else {
			data = {
				logs: [],
				firstEventTime: currentTime
			};
			correlationCache.set(correlationId, data);
			if (correlationCache.size > CACHE_CAPACITY) {
				const firstKey = correlationCache.keys().next().value;
				if (firstKey !== void 0) correlationCache.delete(firstKey);
			}
		}
		data.logs.push({
			...loggedMessage,
			milliseconds: currentTime - data.firstEventTime
		});
		if (data.logs.length > MAX_LOGS_PER_CORRELATION) data.logs.shift();
	}
	/**
	* Extracts the leading minification hash from a log message, if present.
	*
	* Minified messages are produced by the logger-minify rollup plugin and are
	* either a bare 6-character alphanumeric hash, or that hash followed by a space
	* and runtime variables appended for local (console) logging, e.g.
	* "abc123 user-1 popup". Only the leading hash is returned so that telemetry
	* never captures the appended variables. Returns null when the message is not
	* a minified message.
	*/
	function getMessageHash(str) {
		if (str.length < 6) return null;
		if (str.length > 6 && str[6] !== " ") return null;
		for (let i = 0; i < 6; i++) {
			const char = str[i];
			if (!(char >= "a" && char <= "z" || char >= "A" && char <= "Z" || char >= "0" && char <= "9")) return null;
		}
		return str.substring(0, 6);
	}
	/**
	* Class which facilitates logging of messages to a specific place.
	*/
	var Logger = class Logger {
		constructor(loggerOptions, packageName, packageVersion) {
			this.level = exports.LogLevel.Info;
			const defaultLoggerCallback = () => {};
			const setLoggerOptions = loggerOptions || Logger.createDefaultLoggerOptions();
			this.localCallback = setLoggerOptions.loggerCallback || defaultLoggerCallback;
			this.piiLoggingEnabled = setLoggerOptions.piiLoggingEnabled || false;
			this.level = typeof setLoggerOptions.logLevel === "number" ? setLoggerOptions.logLevel : exports.LogLevel.Info;
			this.packageName = packageName || "";
			this.packageVersion = packageVersion || "";
		}
		static createDefaultLoggerOptions() {
			return {
				loggerCallback: () => {},
				piiLoggingEnabled: false,
				logLevel: exports.LogLevel.Info
			};
		}
		/**
		* Create new Logger with existing configurations.
		*/
		clone(packageName, packageVersion) {
			return new Logger({
				loggerCallback: this.localCallback,
				piiLoggingEnabled: this.piiLoggingEnabled,
				logLevel: this.level
			}, packageName, packageVersion);
		}
		/**
		* Log message with required options.
		*/
		logMessage(logMessage, options) {
			const correlationId = options.correlationId;
			const messageHash = getMessageHash(logMessage);
			if (messageHash) addLogToCache(correlationId, {
				hash: messageHash,
				level: options.logLevel,
				containsPii: options.containsPii || false,
				milliseconds: 0
			});
			if (options.logLevel > this.level || !this.piiLoggingEnabled && options.containsPii) return;
			const log = `${`[${(/* @__PURE__ */ new Date()).toUTCString()}] : [${correlationId}]`} : ${this.packageName}@${this.packageVersion} : ${exports.LogLevel[options.logLevel]} - ${logMessage}`;
			this.executeCallback(options.logLevel, log, options.containsPii || false);
		}
		/**
		* Execute callback with message.
		*/
		executeCallback(level, message, containsPii) {
			if (this.localCallback) this.localCallback(level, message, containsPii);
		}
		/**
		* Logs error messages.
		*/
		error(message, correlationId) {
			this.logMessage(message, {
				logLevel: exports.LogLevel.Error,
				containsPii: false,
				correlationId
			});
		}
		/**
		* Logs error messages with PII.
		*/
		errorPii(message, correlationId) {
			this.logMessage(message, {
				logLevel: exports.LogLevel.Error,
				containsPii: true,
				correlationId
			});
		}
		/**
		* Logs warning messages.
		*/
		warning(message, correlationId) {
			this.logMessage(message, {
				logLevel: exports.LogLevel.Warning,
				containsPii: false,
				correlationId
			});
		}
		/**
		* Logs warning messages with PII.
		*/
		warningPii(message, correlationId) {
			this.logMessage(message, {
				logLevel: exports.LogLevel.Warning,
				containsPii: true,
				correlationId
			});
		}
		/**
		* Logs info messages.
		*/
		info(message, correlationId) {
			this.logMessage(message, {
				logLevel: exports.LogLevel.Info,
				containsPii: false,
				correlationId
			});
		}
		/**
		* Logs info messages with PII.
		*/
		infoPii(message, correlationId) {
			this.logMessage(message, {
				logLevel: exports.LogLevel.Info,
				containsPii: true,
				correlationId
			});
		}
		/**
		* Logs verbose messages.
		*/
		verbose(message, correlationId) {
			this.logMessage(message, {
				logLevel: exports.LogLevel.Verbose,
				containsPii: false,
				correlationId
			});
		}
		/**
		* Logs verbose messages with PII.
		*/
		verbosePii(message, correlationId) {
			this.logMessage(message, {
				logLevel: exports.LogLevel.Verbose,
				containsPii: true,
				correlationId
			});
		}
		/**
		* Logs trace messages.
		*/
		trace(message, correlationId) {
			this.logMessage(message, {
				logLevel: exports.LogLevel.Trace,
				containsPii: false,
				correlationId
			});
		}
		/**
		* Logs trace messages with PII.
		*/
		tracePii(message, correlationId) {
			this.logMessage(message, {
				logLevel: exports.LogLevel.Trace,
				containsPii: true,
				correlationId
			});
		}
		/**
		* Returns whether PII Logging is enabled or not.
		*/
		isPiiLoggingEnabled() {
			return this.piiLoggingEnabled || false;
		}
	};
	/*! @azure/msal-common v16.14.3 2026-10-21 */
	const name$1 = "@azure/msal-common";
	const version$1 = "16.14.3";
	/*! @azure/msal-common v16.14.3 2026-10-21 */
	const cacheQuotaExceeded = "cache_quota_exceeded";
	const cacheErrorUnknown = "cache_error_unknown";
	/*! @azure/msal-common v16.14.3 2026-10-21 */
	/**
	* Error thrown when there is an error with the cache
	*/
	var CacheError = class CacheError extends Error {
		constructor(errorCode, errorMessage) {
			const message = errorMessage || getDefaultErrorMessage(errorCode);
			super(message);
			Object.setPrototypeOf(this, CacheError.prototype);
			this.name = "CacheError";
			this.errorCode = errorCode;
			this.errorMessage = message;
		}
	};
	/**
	* Helper function to wrap browser errors in a CacheError object
	* @param e
	* @returns
	*/
	function createCacheError(e) {
		if (!(e instanceof Error)) return new CacheError(cacheErrorUnknown);
		if (e.name === "QuotaExceededError" || e.name === "NS_ERROR_DOM_QUOTA_REACHED" || e.message.includes("exceeded the quota")) return new CacheError(cacheQuotaExceeded);
		else return new CacheError(e.name, e.message);
	}
	/*! @azure/msal-common v16.14.3 2026-10-21 */
	/**
	* Interface class which implement cache storage functions used by MSAL to perform validity checks, and store tokens.
	* @internal
	*/
	var CacheManager = class {
		constructor(clientId, cryptoImpl, logger, performanceClient, staticAuthorityOptions, tokenBindingKeyManager) {
			this.clientId = clientId;
			this.cryptoImpl = cryptoImpl;
			this.tokenBindingKeyManager = tokenBindingKeyManager;
			this.commonLogger = logger.clone(name$1, version$1);
			this.staticAuthorityOptions = staticAuthorityOptions;
			this.performanceClient = performanceClient;
		}
		/**
		* Returns all the accounts in the cache that match the optional filter. If no filter is provided, all accounts are returned.
		* @param accountFilter - (Optional) filter to narrow down the accounts returned
		* @returns Array of AccountInfo objects in cache
		*/
		getAllAccounts(accountFilter = {}, correlationId) {
			return this.buildTenantProfiles(this.getAccountsFilteredBy(accountFilter, correlationId), correlationId, accountFilter);
		}
		/**
		* Gets first tenanted AccountInfo object found based on provided filters
		*/
		getAccountInfoFilteredBy(accountFilter, correlationId) {
			if (Object.keys(accountFilter).length === 0 || Object.values(accountFilter).every((value) => value === null || value === void 0 || value === "")) {
				this.commonLogger.warning("getAccountInfoFilteredBy: Account filter is empty or invalid, returning null", correlationId);
				return null;
			}
			const allAccounts = this.getAllAccounts(accountFilter, correlationId);
			if (allAccounts.length > 1) return allAccounts.sort((a, b) => {
				const aHasClaims = a.idTokenClaims ? 1 : 0;
				return (b.idTokenClaims ? 1 : 0) - aHasClaims;
			})[0];
			else if (allAccounts.length === 1) return allAccounts[0];
			else return null;
		}
		/**
		* Returns a single matching
		* @param accountFilter
		* @returns
		*/
		getBaseAccountInfo(accountFilter, correlationId) {
			const accountEntities = this.getAccountsFilteredBy(accountFilter, correlationId);
			if (accountEntities.length > 0) return getAccountInfo(accountEntities[0]);
			else return null;
		}
		/**
		* Matches filtered account entities with cached ID tokens that match the tenant profile-specific account filters
		* and builds the account info objects from the matching ID token's claims
		* @param cachedAccounts
		* @param accountFilter
		* @returns Array of AccountInfo objects that match account and tenant profile filters
		*/
		buildTenantProfiles(cachedAccounts, correlationId, accountFilter) {
			return cachedAccounts.flatMap((accountEntity) => {
				return this.getTenantProfilesFromAccountEntity(accountEntity, correlationId, accountFilter?.tenantId, accountFilter);
			});
		}
		getTenantedAccountInfoByFilter(accountInfo, tokenKeys, tenantProfile, correlationId, tenantProfileFilter) {
			let tenantedAccountInfo = null;
			let idTokenClaims;
			if (tenantProfileFilter) {
				if (!this.tenantProfileMatchesFilter(tenantProfile, tenantProfileFilter)) return null;
			}
			const idToken = this.getIdToken(accountInfo, correlationId, tokenKeys, tenantProfile.tenantId);
			if (idToken) {
				idTokenClaims = extractTokenClaims(idToken.secret, this.cryptoImpl.base64Decode, correlationId);
				if (!this.idTokenClaimsMatchTenantProfileFilter(idTokenClaims, tenantProfileFilter)) return null;
			}
			tenantedAccountInfo = updateAccountTenantProfileData(accountInfo, tenantProfile, idTokenClaims, idToken?.secret);
			return tenantedAccountInfo;
		}
		getTenantProfilesFromAccountEntity(accountEntity, correlationId, targetTenantId, tenantProfileFilter) {
			const accountInfo = getAccountInfo(accountEntity);
			let searchTenantProfiles = accountInfo.tenantProfiles || /* @__PURE__ */ new Map();
			const tokenKeys = this.getTokenKeys();
			if (targetTenantId) {
				const tenantProfile = searchTenantProfiles.get(targetTenantId);
				if (tenantProfile) searchTenantProfiles = new Map([[targetTenantId, tenantProfile]]);
				else return [];
			}
			const matchingTenantProfiles = [];
			searchTenantProfiles.forEach((tenantProfile) => {
				const tenantedAccountInfo = this.getTenantedAccountInfoByFilter(accountInfo, tokenKeys, tenantProfile, correlationId, tenantProfileFilter);
				if (tenantedAccountInfo) matchingTenantProfiles.push(tenantedAccountInfo);
			});
			return matchingTenantProfiles;
		}
		tenantProfileMatchesFilter(tenantProfile, tenantProfileFilter) {
			if (!!tenantProfileFilter.localAccountId && !this.matchLocalAccountIdFromTenantProfile(tenantProfile, tenantProfileFilter.localAccountId)) return false;
			if (!!tenantProfileFilter.name && !(tenantProfile.name === tenantProfileFilter.name)) return false;
			if (tenantProfileFilter.isHomeTenant !== void 0 && !(tenantProfile.isHomeTenant === tenantProfileFilter.isHomeTenant)) return false;
			if (!!tenantProfileFilter.username && !this.matchUsername(tenantProfile.username, tenantProfileFilter.username) && !this.matchUsername(tenantProfile.upn, tenantProfileFilter.username)) return false;
			if (!!tenantProfileFilter.loginHint && !this.matchLoginHintWithTenantProfile(tenantProfile, tenantProfileFilter.loginHint)) return false;
			if (!!tenantProfileFilter.upn && !(tenantProfile.upn === tenantProfileFilter.upn)) return false;
			if (!!tenantProfileFilter.nativeAccountId && tenantProfile.nativeAccountId !== tenantProfileFilter.nativeAccountId) return false;
			return true;
		}
		idTokenClaimsMatchTenantProfileFilter(idTokenClaims, tenantProfileFilter) {
			if (tenantProfileFilter) {
				if (!!tenantProfileFilter.localAccountId && !this.matchLocalAccountIdFromTokenClaims(idTokenClaims, tenantProfileFilter.localAccountId)) return false;
				if (!!tenantProfileFilter.loginHint && !this.matchLoginHintFromTokenClaims(idTokenClaims, tenantProfileFilter.loginHint)) return false;
				if (!!tenantProfileFilter.username && !this.matchUsername(idTokenClaims.preferred_username, tenantProfileFilter.username) && !this.matchUsername(idTokenClaims.upn, tenantProfileFilter.username)) return false;
				if (!!tenantProfileFilter.name && !this.matchName(idTokenClaims, tenantProfileFilter.name)) return false;
				if (!!tenantProfileFilter.sid && !this.matchSid(idTokenClaims, tenantProfileFilter.sid)) return false;
			}
			return true;
		}
		/**
		* saves a cache record
		* @param cacheRecord {CacheRecord}
		* @param storeInCache {?StoreInCache}
		* @param correlationId {?string} correlation id
		*/
		async saveCacheRecord(cacheRecord, correlationId, kmsi, apiId, storeInCache) {
			if (!cacheRecord) throw createClientAuthError(invalidCacheRecord, correlationId);
			try {
				if (!!cacheRecord.account) await this.setAccount(cacheRecord.account, correlationId, kmsi, apiId);
				if (!!cacheRecord.idToken && storeInCache?.idToken !== false) await this.setIdTokenCredential(cacheRecord.idToken, correlationId, kmsi);
				if (!!cacheRecord.accessToken && storeInCache?.accessToken !== false) await this.saveAccessToken(cacheRecord.accessToken, correlationId, kmsi);
				if (!!cacheRecord.refreshToken && storeInCache?.refreshToken !== false) await this.setRefreshTokenCredential(cacheRecord.refreshToken, correlationId, kmsi);
				if (!!cacheRecord.appMetadata) this.setAppMetadata(cacheRecord.appMetadata, correlationId);
			} catch (e) {
				this.commonLogger?.error(`CacheManager.saveCacheRecord: failed`, correlationId);
				if (e instanceof AuthError) throw e;
				else throw createCacheError(e);
			}
		}
		/**
		* saves access token credential
		* @param credential - the access token entity to save
		* @param correlationId - unique identifier for the request
		* @param kmsi - keep me signed in flag
		*/
		async saveAccessToken(credential, correlationId, kmsi) {
			let additionalCacheKeyHash;
			if (credential.additionalCacheKeyComponents && Object.keys(credential.additionalCacheKeyComponents).length > 0) additionalCacheKeyHash = await this.cryptoImpl.hashString(JSON.stringify(credential.additionalCacheKeyComponents));
			const accessTokenFilter = {
				clientId: credential.clientId,
				credentialType: credential.credentialType,
				environment: credential.environment,
				homeAccountId: credential.homeAccountId,
				realm: credential.realm,
				tokenType: credential.tokenType
			};
			const tokenKeys = this.getTokenKeys();
			const currentScopes = ScopeSet.fromString(credential.target, correlationId);
			tokenKeys.accessToken.forEach((key) => {
				if (!this.accessTokenKeyMatchesFilter(key, accessTokenFilter, false)) return;
				const tokenEntity = this.getAccessTokenCredential(key, correlationId);
				if (tokenEntity && this.credentialMatchesFilter(tokenEntity, accessTokenFilter, correlationId)) {
					if (ScopeSet.fromString(tokenEntity.target, correlationId).intersectingScopeSets(currentScopes)) this.removeAccessToken(key, correlationId);
				}
			});
			await this.setAccessTokenCredential(credential, correlationId, kmsi, additionalCacheKeyHash);
		}
		/**
		* Retrieve account entities matching all provided tenant-agnostic filters; if no filter is set, get all account entities in the cache
		* Not checking for casing as keys are all generated in lower case, remember to convert to lower case if object properties are compared
		* @param accountFilter - An object containing Account properties to filter by
		*/
		getAccountsFilteredBy(accountFilter, correlationId) {
			const allAccountKeys = this.getAccountKeys();
			const matchingAccounts = [];
			allAccountKeys.forEach((cacheKey) => {
				const entity = this.getAccount(cacheKey, correlationId);
				if (!entity) return;
				if (!!accountFilter.homeAccountId && !this.matchHomeAccountId(entity, accountFilter.homeAccountId)) return;
				if (!!accountFilter.environment && !this.matchEnvironment(entity, accountFilter.environment, correlationId)) return;
				if (!!accountFilter.realm && !this.matchRealm(entity, accountFilter.realm)) return;
				if (!!accountFilter.authorityType && !this.matchAuthorityType(entity, accountFilter.authorityType)) return;
				const tenantProfileFilter = {
					localAccountId: accountFilter?.localAccountId,
					name: accountFilter?.name,
					username: accountFilter?.username,
					loginHint: accountFilter?.loginHint,
					upn: accountFilter?.upn,
					nativeAccountId: accountFilter?.nativeAccountId
				};
				const matchingTenantProfiles = entity.tenantProfiles?.filter((tenantProfile) => {
					return this.tenantProfileMatchesFilter(tenantProfile, tenantProfileFilter);
				});
				if (matchingTenantProfiles && matchingTenantProfiles.length === 0) return;
				matchingAccounts.push(entity);
			});
			return matchingAccounts;
		}
		/**
		* Returns whether or not the given credential entity matches the filter
		* @param entity
		* @param filter
		* @param correlationId
		* @returns
		*/
		credentialMatchesFilter(entity, filter, correlationId) {
			if (!!filter.clientId && !this.matchClientId(entity, filter.clientId)) return false;
			if (!!filter.userAssertionHash && !this.matchUserAssertionHash(entity, filter.userAssertionHash)) return false;
			if (typeof filter.homeAccountId === "string" && !this.matchHomeAccountId(entity, filter.homeAccountId)) return false;
			if (!!filter.environment && !this.matchEnvironment(entity, filter.environment, correlationId)) return false;
			if (!!filter.realm && !this.matchRealm(entity, filter.realm)) return false;
			if (!!filter.credentialType && !this.matchCredentialType(entity, filter.credentialType)) return false;
			if (!!filter.familyId && !this.matchFamilyId(entity, filter.familyId)) return false;
			if (!!filter.target && !this.matchTarget(entity, filter.target, correlationId)) return false;
			if (entity.credentialType === CredentialType.ACCESS_TOKEN_WITH_AUTH_SCHEME) {
				if (!this.matchAccessTokenWithAuthScheme(entity, filter)) return false;
			}
			const entityComponents = entity.additionalCacheKeyComponents;
			const filterComponents = filter.additionalCacheKeyComponents;
			const entityHasComponents = !!entityComponents && Object.keys(entityComponents).length > 0;
			const filterHasComponents = !!filterComponents && Object.keys(filterComponents).length > 0;
			if (entityHasComponents !== filterHasComponents) return false;
			if (entityHasComponents && filterHasComponents) {
				const entityKeys = Object.keys(entityComponents).sort();
				const filterKeys = Object.keys(filterComponents).sort();
				if (entityKeys.length !== filterKeys.length) return false;
				for (let i = 0; i < entityKeys.length; i++) if (entityKeys[i] !== filterKeys[i] || entityComponents[entityKeys[i]] !== filterComponents[filterKeys[i]]) return false;
			}
			return true;
		}
		/**
		* retrieve appMetadata matching all provided filters; if no filter is set, get all appMetadata
		* @param filter
		* @param correlationId
		*/
		getAppMetadataFilteredBy(filter, correlationId) {
			const allCacheKeys = this.getKeys();
			const matchingAppMetadata = {};
			allCacheKeys.forEach((cacheKey) => {
				if (!this.isAppMetadata(cacheKey)) return;
				const entity = this.getAppMetadata(cacheKey, correlationId);
				if (!entity) return;
				if (!!filter.environment && !this.matchEnvironment(entity, filter.environment, correlationId)) return;
				if (!!filter.clientId && !this.matchClientId(entity, filter.clientId)) return;
				matchingAppMetadata[cacheKey] = entity;
			});
			return matchingAppMetadata;
		}
		/**
		* retrieve authorityMetadata that contains a matching alias
		* @param host
		* @param correlationId
		*/
		getAuthorityMetadataByAlias(host, correlationId) {
			const allCacheKeys = this.getAuthorityMetadataKeys();
			let matchedEntity = null;
			allCacheKeys.forEach((cacheKey) => {
				if (!this.isAuthorityMetadata(cacheKey) || cacheKey.indexOf(this.clientId) === -1) return;
				const entity = this.getAuthorityMetadata(cacheKey, correlationId);
				if (!entity) return;
				if (entity.aliases.indexOf(host) === -1) return;
				matchedEntity = entity;
			});
			return matchedEntity;
		}
		/**
		* Removes all accounts and related tokens from cache.
		*/
		removeAllAccounts(correlationId) {
			this.getAllAccounts({}, correlationId).forEach((account) => {
				this.removeAccount(account, correlationId);
			});
		}
		/**
		* Removes the account and related tokens for a given account key
		* @param account
		*/
		removeAccount(account, correlationId) {
			this.removeAccountContext(account, correlationId);
			const accountKeys = this.getAccountKeys();
			const keyFilter = (key) => {
				return key.includes(account.homeAccountId) && key.includes(account.environment);
			};
			accountKeys.filter(keyFilter).forEach((key) => {
				this.removeItem(key, correlationId);
				this.performanceClient.incrementFields({ accountsRemoved: 1 }, correlationId);
			});
		}
		/**
		* Removes credentials associated with the provided account
		* @param account
		*/
		removeAccountContext(account, correlationId) {
			const allTokenKeys = this.getTokenKeys();
			const keyFilter = (key) => {
				return key.includes(account.homeAccountId) && key.includes(account.environment);
			};
			allTokenKeys.idToken.filter(keyFilter).forEach((key) => {
				this.removeIdToken(key, correlationId);
			});
			allTokenKeys.accessToken.filter(keyFilter).forEach((key) => {
				this.removeAccessToken(key, correlationId);
			});
			allTokenKeys.refreshToken.filter(keyFilter).forEach((key) => {
				this.removeRefreshToken(key, correlationId);
			});
		}
		/**
		* returns a boolean if the given credential is removed
		* @param key
		* @param correlationId
		*/
		removeAccessToken(key, correlationId) {
			const credential = this.getAccessTokenCredential(key, correlationId);
			if (!credential) return;
			this.removeItem(key, correlationId);
			this.performanceClient.incrementFields({ accessTokensRemoved: 1 }, correlationId);
			if (credential.credentialType.toLowerCase() === CredentialType.ACCESS_TOKEN_WITH_AUTH_SCHEME.toLowerCase()) switch (credential.tokenType?.toLowerCase()) {
				case AuthenticationScheme.POP:
				case AuthenticationScheme.DPOP.toLowerCase(): {
					const kid = credential.keyId;
					if (kid) this.tokenBindingKeyManager.removeTokenBindingKey(kid, correlationId).catch(() => {
						this.commonLogger.error("Failed to remove token binding key", correlationId);
						this.performanceClient?.incrementFields({ removeTokenBindingKeyFailure: 1 }, correlationId);
					});
					break;
				}
			}
		}
		/**
		* Removes all app metadata objects from cache.
		*/
		removeAppMetadata(correlationId) {
			this.getKeys().forEach((cacheKey) => {
				if (this.isAppMetadata(cacheKey)) this.removeItem(cacheKey, correlationId);
			});
			return true;
		}
		/**
		* Retrieve IdTokenEntity from cache
		* @param account {AccountInfo}
		* @param tokenKeys {?TokenKeys}
		* @param targetRealm {?string}
		* @param performanceClient {?IPerformanceClient}
		* @param correlationId {?string}
		*/
		getIdToken(account, correlationId, tokenKeys, targetRealm) {
			this.commonLogger.trace("CacheManager - getIdToken called", correlationId);
			const idTokenFilter = {
				homeAccountId: account.homeAccountId,
				environment: account.environment,
				credentialType: CredentialType.ID_TOKEN,
				clientId: this.clientId,
				realm: targetRealm
			};
			const idTokenMap = this.getIdTokensByFilter(idTokenFilter, correlationId, tokenKeys);
			const numIdTokens = idTokenMap.size;
			if (numIdTokens < 1) {
				this.commonLogger.info("CacheManager:getIdToken - No token found", correlationId);
				return null;
			} else if (numIdTokens > 1) {
				let tokensToBeRemoved = idTokenMap;
				if (!targetRealm) {
					const homeIdTokenMap = /* @__PURE__ */ new Map();
					idTokenMap.forEach((idToken, key) => {
						if (idToken.realm === account.tenantId) homeIdTokenMap.set(key, idToken);
					});
					const numHomeIdTokens = homeIdTokenMap.size;
					if (numHomeIdTokens < 1) {
						this.commonLogger.info("CacheManager:getIdToken - Multiple ID tokens found for account but none match account entity tenant id, returning first result", correlationId);
						return idTokenMap.values().next().value ?? null;
					} else if (numHomeIdTokens === 1) {
						this.commonLogger.info("CacheManager:getIdToken - Multiple ID tokens found for account, defaulting to home tenant profile", correlationId);
						return homeIdTokenMap.values().next().value ?? null;
					} else tokensToBeRemoved = homeIdTokenMap;
				}
				this.commonLogger.info("CacheManager:getIdToken - Multiple matching ID tokens found, clearing them", correlationId);
				tokensToBeRemoved.forEach((idToken, key) => {
					this.removeIdToken(key, correlationId);
				});
				this.performanceClient.addFields({ multiMatchedID: idTokenMap.size }, correlationId);
				return null;
			}
			this.commonLogger.info("CacheManager:getIdToken - Returning ID token", correlationId);
			return idTokenMap.values().next().value ?? null;
		}
		/**
		* Gets all idTokens matching the given filter
		* @param filter
		* @returns
		*/
		getIdTokensByFilter(filter, correlationId, tokenKeys) {
			const idTokenKeys = tokenKeys && tokenKeys.idToken || this.getTokenKeys().idToken;
			const idTokens = /* @__PURE__ */ new Map();
			idTokenKeys.forEach((key) => {
				if (!this.idTokenKeyMatchesFilter(key, {
					clientId: this.clientId,
					...filter
				})) return;
				const idToken = this.getIdTokenCredential(key, correlationId);
				if (idToken && this.credentialMatchesFilter(idToken, filter, correlationId)) idTokens.set(key, idToken);
			});
			return idTokens;
		}
		/**
		* Validate the cache key against filter before retrieving and parsing cache value
		* @param key
		* @param filter
		* @returns
		*/
		idTokenKeyMatchesFilter(inputKey, filter) {
			const key = inputKey.toLowerCase();
			if (filter.clientId && key.indexOf(filter.clientId.toLowerCase()) === -1) return false;
			if (filter.homeAccountId && key.indexOf(filter.homeAccountId.toLowerCase()) === -1) return false;
			return true;
		}
		/**
		* Removes idToken from the cache
		* @param key
		*/
		removeIdToken(key, correlationId) {
			this.removeItem(key, correlationId);
		}
		/**
		* Removes refresh token from the cache
		* @param key
		*/
		removeRefreshToken(key, correlationId) {
			this.removeItem(key, correlationId);
		}
		/**
		* Retrieve AccessTokenEntity from cache
		* @param account {AccountInfo}
		* @param request {BaseAuthRequest}
		* @param tokenKeys {?TokenKeys}
		* @param performanceClient {?IPerformanceClient}
		*/
		getAccessToken(account, request, tokenKeys, targetRealm) {
			const correlationId = request.correlationId;
			this.commonLogger.trace("CacheManager - getAccessToken called", correlationId);
			const scopes = ScopeSet.createSearchScopes(request.scopes, correlationId);
			const authScheme = request.authenticationScheme || AuthenticationScheme.BEARER;
			const credentialType = authScheme.toLowerCase() !== AuthenticationScheme.BEARER.toLowerCase() ? CredentialType.ACCESS_TOKEN_WITH_AUTH_SCHEME : CredentialType.ACCESS_TOKEN;
			const attributeTokenPartition = serializeAttributeTokens(request.attributeTokens);
			const additionalCacheKeyComponents = attributeTokenPartition ? { attribute_tokens: attributeTokenPartition } : void 0;
			const accessTokenFilter = {
				homeAccountId: account.homeAccountId,
				environment: account.environment,
				credentialType,
				clientId: this.clientId,
				realm: targetRealm || account.tenantId,
				target: scopes,
				tokenType: authScheme,
				keyId: authScheme === AuthenticationScheme.SSH ? request.sshKid : void 0,
				additionalCacheKeyComponents
			};
			const accessTokenKeys = tokenKeys && tokenKeys.accessToken || this.getTokenKeys().accessToken;
			const accessTokens = [];
			const matchedKeys = [];
			accessTokenKeys.forEach((key) => {
				if (this.accessTokenKeyMatchesFilter(key, accessTokenFilter, true)) {
					const accessToken = this.getAccessTokenCredential(key, correlationId);
					if (accessToken && this.credentialMatchesFilter(accessToken, accessTokenFilter, correlationId)) {
						accessTokens.push(accessToken);
						matchedKeys.push(key);
					}
				}
			});
			if (accessTokens.length < 1) {
				this.commonLogger.info("CacheManager:getAccessToken - No token found", correlationId);
				return null;
			} else if (accessTokens.length > 1) {
				this.commonLogger.info("CacheManager:getAccessToken - Multiple access tokens found, clearing them", correlationId);
				matchedKeys.forEach((key) => {
					this.removeAccessToken(key, correlationId);
				});
				this.performanceClient.addFields({ multiMatchedAT: accessTokens.length }, correlationId);
				return null;
			}
			this.commonLogger.info("CacheManager:getAccessToken - Returning access token", correlationId);
			return accessTokens[0];
		}
		/**
		* Validate the cache key against filter before retrieving and parsing cache value
		* @param key
		* @param filter
		* @param keyMustContainAllScopes
		* @returns
		*/
		accessTokenKeyMatchesFilter(inputKey, filter, keyMustContainAllScopes) {
			const key = inputKey.toLowerCase();
			if (filter.clientId && key.indexOf(filter.clientId.toLowerCase()) === -1) return false;
			if (filter.homeAccountId && key.indexOf(filter.homeAccountId.toLowerCase()) === -1) return false;
			if (filter.realm && key.indexOf(filter.realm.toLowerCase()) === -1) return false;
			if (filter.target) {
				const scopes = filter.target.asArray();
				for (let i = 0; i < scopes.length; i++) if (keyMustContainAllScopes && !key.includes(scopes[i].toLowerCase())) return false;
				else if (!keyMustContainAllScopes && key.includes(scopes[i].toLowerCase())) return true;
			}
			return true;
		}
		/**
		* Gets all access tokens matching the filter
		* @param filter
		* @returns
		*/
		getAccessTokensByFilter(filter, correlationId) {
			const tokenKeys = this.getTokenKeys();
			const accessTokens = [];
			tokenKeys.accessToken.forEach((key) => {
				if (!this.accessTokenKeyMatchesFilter(key, filter, true)) return;
				const accessToken = this.getAccessTokenCredential(key, correlationId);
				if (accessToken && this.credentialMatchesFilter(accessToken, filter, correlationId)) accessTokens.push(accessToken);
			});
			return accessTokens;
		}
		/**
		* Helper to retrieve the appropriate refresh token from cache
		* @param account {AccountInfo}
		* @param familyRT {boolean}
		* @param tokenKeys {?TokenKeys}
		* @param performanceClient {?IPerformanceClient}
		* @param correlationId {?string}
		*/
		getRefreshToken(account, familyRT, correlationId, tokenKeys) {
			this.commonLogger.trace("CacheManager - getRefreshToken called", correlationId);
			const id = familyRT ? THE_FAMILY_ID : void 0;
			const refreshTokenFilter = {
				homeAccountId: account.homeAccountId,
				environment: account.environment,
				credentialType: CredentialType.REFRESH_TOKEN,
				clientId: this.clientId,
				familyId: id
			};
			const refreshTokenKeys = tokenKeys && tokenKeys.refreshToken || this.getTokenKeys().refreshToken;
			const refreshTokens = [];
			refreshTokenKeys.forEach((key) => {
				if (this.refreshTokenKeyMatchesFilter(key, refreshTokenFilter)) {
					const refreshToken = this.getRefreshTokenCredential(key, correlationId);
					if (refreshToken && this.credentialMatchesFilter(refreshToken, refreshTokenFilter, correlationId)) refreshTokens.push(refreshToken);
				}
			});
			const numRefreshTokens = refreshTokens.length;
			if (numRefreshTokens < 1) {
				this.commonLogger.info("CacheManager:getRefreshToken - No refresh token found.", correlationId);
				return null;
			}
			if (numRefreshTokens > 1) this.performanceClient.addFields({ multiMatchedRT: numRefreshTokens }, correlationId);
			this.commonLogger.info("CacheManager:getRefreshToken - returning refresh token", correlationId);
			return refreshTokens[0];
		}
		/**
		* Validate the cache key against filter before retrieving and parsing cache value
		* @param key
		* @param filter
		*/
		refreshTokenKeyMatchesFilter(inputKey, filter) {
			const key = inputKey.toLowerCase();
			if (filter.familyId && key.indexOf(filter.familyId.toLowerCase()) === -1) return false;
			if (!filter.familyId && filter.clientId && key.indexOf(filter.clientId.toLowerCase()) === -1) return false;
			if (filter.homeAccountId && key.indexOf(filter.homeAccountId.toLowerCase()) === -1) return false;
			return true;
		}
		/**
		* Retrieve AppMetadataEntity from cache
		*/
		readAppMetadataFromCache(environment, correlationId) {
			const appMetadataFilter = {
				environment,
				clientId: this.clientId
			};
			const appMetadata = this.getAppMetadataFilteredBy(appMetadataFilter, correlationId);
			const appMetadataEntries = Object.keys(appMetadata).map((key) => appMetadata[key]);
			const numAppMetadata = appMetadataEntries.length;
			if (numAppMetadata < 1) return null;
			else if (numAppMetadata > 1) throw createClientAuthError(multipleMatchingAppMetadata, correlationId);
			return appMetadataEntries[0];
		}
		/**
		* Return the family_id value associated  with FOCI
		* @param environment
		* @param clientId
		*/
		isAppMetadataFOCI(environment, correlationId) {
			const appMetadata = this.readAppMetadataFromCache(environment, correlationId);
			return !!(appMetadata && appMetadata.familyId === THE_FAMILY_ID);
		}
		/**
		* helper to match account ids
		* @param value
		* @param homeAccountId
		*/
		matchHomeAccountId(entity, homeAccountId) {
			return !!(typeof entity.homeAccountId === "string" && homeAccountId === entity.homeAccountId);
		}
		/**
		* helper to match account ids
		* @param entity
		* @param localAccountId
		* @returns
		*/
		matchLocalAccountIdFromTokenClaims(tokenClaims, localAccountId) {
			return localAccountId === (tokenClaims.oid || tokenClaims.sub);
		}
		matchLocalAccountIdFromTenantProfile(tenantProfile, localAccountId) {
			return tenantProfile.localAccountId === localAccountId;
		}
		/**
		* helper to match names
		* @param entity
		* @param name
		* @returns true if the downcased name properties are present and match in the filter and the entity
		*/
		matchName(claims, name) {
			return !!(name.toLowerCase() === claims.name?.toLowerCase());
		}
		/**
		* helper to match usernames
		* @param entity
		* @param username
		* @returns
		*/
		matchUsername(cachedUsername, filterUsername) {
			return !!(cachedUsername && typeof cachedUsername === "string" && filterUsername?.toLowerCase() === cachedUsername.toLowerCase());
		}
		/**
		* helper to match loginhints
		* @param entity
		* @param loginHint
		* @returns
		*/
		matchLoginHintWithTenantProfile(tenantProfile, loginHintFilter) {
			return tenantProfile.loginHint === loginHintFilter || tenantProfile.username === loginHintFilter || tenantProfile.upn === loginHintFilter;
		}
		/**
		* helper to match assertion
		* @param value
		* @param oboAssertion
		*/
		matchUserAssertionHash(entity, userAssertionHash) {
			return !!(entity.userAssertionHash && userAssertionHash === entity.userAssertionHash);
		}
		/**
		* helper to match environment
		* @param value
		* @param environment
		*/
		matchEnvironment(entity, environment, correlationId) {
			if (this.staticAuthorityOptions) {
				const staticAliases = getAliasesFromStaticSources(this.staticAuthorityOptions, this.commonLogger, correlationId);
				if (staticAliases.includes(environment) && staticAliases.includes(entity.environment)) return true;
			}
			const cloudMetadata = this.getAuthorityMetadataByAlias(environment, correlationId);
			if (cloudMetadata && cloudMetadata.aliases.indexOf(entity.environment) > -1) return true;
			return false;
		}
		/**
		* helper to match credential type
		* @param entity
		* @param credentialType
		*/
		matchCredentialType(entity, credentialType) {
			return entity.credentialType && credentialType.toLowerCase() === entity.credentialType.toLowerCase();
		}
		/**
		* helper to match client ids
		* @param entity
		* @param clientId
		*/
		matchClientId(entity, clientId) {
			return !!(entity.clientId && clientId === entity.clientId);
		}
		/**
		* helper to match family ids
		* @param entity
		* @param familyId
		*/
		matchFamilyId(entity, familyId) {
			return !!(entity.familyId && familyId === entity.familyId);
		}
		/**
		* helper to match realm
		* @param entity
		* @param realm
		*/
		matchRealm(entity, realm) {
			return !!(entity.realm?.toLowerCase() === realm.toLowerCase());
		}
		/**
		* helper to match loginHint which can be either:
		* 1. login_hint ID token claim
		* 2. username in cached account object
		* 3. upn in ID token claims
		* @param entity
		* @param loginHint
		* @returns
		*/
		matchLoginHintFromTokenClaims(tokenClaims, loginHint) {
			if (tokenClaims.login_hint === loginHint) return true;
			if (tokenClaims.preferred_username === loginHint) return true;
			if (tokenClaims.upn === loginHint) return true;
			if (tokenClaims.emails && tokenClaims.emails.includes(loginHint)) return true;
			return false;
		}
		/**
		* Helper to match sid
		* @param entity
		* @param sid
		* @returns true if the sid claim is present and matches the filter
		*/
		matchSid(idTokenClaims, sid) {
			return idTokenClaims.sid === sid;
		}
		matchAuthorityType(entity, authorityType) {
			return !!(entity.authorityType && authorityType.toLowerCase() === entity.authorityType.toLowerCase());
		}
		/**
		* Returns true if the target scopes are a subset of the current entity's scopes, false otherwise.
		* @param entity
		* @param target
		*/
		matchTarget(entity, target, correlationId) {
			if (entity.credentialType !== CredentialType.ACCESS_TOKEN && entity.credentialType !== CredentialType.ACCESS_TOKEN_WITH_AUTH_SCHEME || !entity.target) return false;
			return ScopeSet.fromString(entity.target, correlationId).containsScopeSet(target);
		}
		/**
		* Returns true if the credential's tokenType or Authentication Scheme matches the one in the request, false otherwise
		* @param entity
		* @param tokenType
		*/
		matchTokenType(entity, tokenType) {
			return !!(entity.tokenType && entity.tokenType.toLowerCase() === tokenType.toLowerCase());
		}
		matchAccessTokenWithAuthScheme(entity, filter) {
			const normalizedFilterTokenType = filter.tokenType?.toLowerCase();
			if (!!filter.tokenType && !this.matchTokenType(entity, filter.tokenType)) return false;
			switch (normalizedFilterTokenType) {
				case "dpop":
				case AuthenticationScheme.SSH: return this.matchKeyBoundAccessToken(entity, filter);
				default: return true;
			}
		}
		matchKeyBoundAccessToken(entity, filter) {
			if (!filter.keyId) return true;
			return this.matchKeyId(entity, filter.keyId);
		}
		/**
		* Returns true if the credential's keyId matches the one in the request, false otherwise
		* @param entity
		* @param keyId
		*/
		matchKeyId(entity, keyId) {
			return !!(entity.keyId && entity.keyId === keyId);
		}
		/**
		* returns if a given cache entity is of the type appmetadata
		* @param key
		*/
		isAppMetadata(key) {
			return key.indexOf(APP_METADATA) !== -1;
		}
		/**
		* returns if a given cache entity is of the type authoritymetadata
		* @param key
		*/
		isAuthorityMetadata(key) {
			return key.indexOf(AUTHORITY_METADATA_CACHE_KEY) !== -1;
		}
		/**
		* returns cache key used for cloud instance metadata
		*/
		generateAuthorityMetadataCacheKey(authority) {
			return `${AUTHORITY_METADATA_CACHE_KEY}-${this.clientId}-${authority}`;
		}
		/**
		* Helper to convert serialized data to object
		* @param obj
		* @param json
		*/
		static toObject(obj, json) {
			for (const propertyName in json) obj[propertyName] = json[propertyName];
			return obj;
		}
	};
	/** @internal */
	var DefaultStorageClass = class extends CacheManager {
		async setAccount() {
			throw createClientAuthError(methodNotImplemented, "");
		}
		getAccount() {
			throw createClientAuthError(methodNotImplemented, "");
		}
		async setIdTokenCredential() {
			throw createClientAuthError(methodNotImplemented, "");
		}
		getIdTokenCredential() {
			throw createClientAuthError(methodNotImplemented, "");
		}
		async setAccessTokenCredential() {
			throw createClientAuthError(methodNotImplemented, "");
		}
		getAccessTokenCredential() {
			throw createClientAuthError(methodNotImplemented, "");
		}
		async setRefreshTokenCredential() {
			throw createClientAuthError(methodNotImplemented, "");
		}
		getRefreshTokenCredential() {
			throw createClientAuthError(methodNotImplemented, "");
		}
		setAppMetadata() {
			throw createClientAuthError(methodNotImplemented, "");
		}
		getAppMetadata() {
			throw createClientAuthError(methodNotImplemented, "");
		}
		setServerTelemetry() {
			throw createClientAuthError(methodNotImplemented, "");
		}
		getServerTelemetry() {
			throw createClientAuthError(methodNotImplemented, "");
		}
		setAuthorityMetadata() {
			throw createClientAuthError(methodNotImplemented, "");
		}
		getAuthorityMetadata() {
			throw createClientAuthError(methodNotImplemented, "");
		}
		getAuthorityMetadataKeys() {
			throw createClientAuthError(methodNotImplemented, "");
		}
		setThrottlingCache() {
			throw createClientAuthError(methodNotImplemented, "");
		}
		getThrottlingCache() {
			throw createClientAuthError(methodNotImplemented, "");
		}
		removeItem() {
			throw createClientAuthError(methodNotImplemented, "");
		}
		getKeys() {
			throw createClientAuthError(methodNotImplemented, "");
		}
		getAccountKeys() {
			throw createClientAuthError(methodNotImplemented, "");
		}
		getTokenKeys() {
			throw createClientAuthError(methodNotImplemented, "");
		}
		generateCredentialKey(_credential, _hash) {
			throw createClientAuthError(methodNotImplemented, "");
		}
		generateAccountKey() {
			throw createClientAuthError(methodNotImplemented, "");
		}
	};
	/*! @azure/msal-common v16.14.3 2026-10-21 */
	/**
	* State of the performance event.
	*
	* @export
	* @enum {number}
	*/
	const PerformanceEventStatus = { InProgress: 1 };
	/*! @azure/msal-common v16.14.3 2026-10-21 */
	var StubPerformanceClient = class {
		generateId() {
			return "callback-id";
		}
		startMeasurement(measureName, correlationId) {
			return {
				end: () => null,
				discard: () => {},
				add: () => {},
				increment: () => {},
				event: {
					eventId: this.generateId(),
					status: PerformanceEventStatus.InProgress,
					authority: "",
					libraryName: "",
					libraryVersion: "",
					clientId: "",
					name: measureName,
					startTimeMs: Date.now(),
					correlationId: correlationId || ""
				}
			};
		}
		endMeasurement() {
			return null;
		}
		discardMeasurements() {}
		removePerformanceCallback() {
			return true;
		}
		addPerformanceCallback() {
			return "";
		}
		emitEvents() {}
		addFields() {}
		addGlobalFields() {}
		incrementFields() {}
		cacheEventByCorrelationId() {}
	};
	/*! @azure/msal-common v16.14.3 2026-10-21 */
	const DEFAULT_SYSTEM_OPTIONS$1 = {
		tokenRenewalOffsetSeconds: DEFAULT_TOKEN_RENEWAL_OFFSET_SEC,
		preventCorsPreflight: false
	};
	const DEFAULT_LOGGER_IMPLEMENTATION = {
		loggerCallback: () => {},
		piiLoggingEnabled: false,
		logLevel: exports.LogLevel.Info,
		correlationId: ""
	};
	const DEFAULT_NETWORK_IMPLEMENTATION = {
		async sendGetRequestAsync() {
			throw createClientAuthError(methodNotImplemented, "");
		},
		async sendPostRequestAsync() {
			throw createClientAuthError(methodNotImplemented, "");
		}
	};
	const DEFAULT_LIBRARY_INFO = {
		sku: SKU,
		version: version$1,
		cpu: "",
		os: ""
	};
	const DEFAULT_CLIENT_CREDENTIALS = {
		clientSecret: "",
		clientAssertion: void 0
	};
	const DEFAULT_AZURE_CLOUD_OPTIONS = {
		azureCloudInstance: AzureCloudInstance.None,
		tenant: `${DEFAULT_COMMON_TENANT}`
	};
	const DEFAULT_TELEMETRY_OPTIONS$1 = { application: {
		appName: "",
		appVersion: ""
	} };
	/**
	* Function that sets the default options when not explicitly configured from app developer
	*
	* @param Configuration
	*
	* @returns Configuration
	* @internal
	*/
	function buildClientConfiguration({ authOptions: userAuthOptions, systemOptions: userSystemOptions, loggerOptions: userLoggerOption, storageInterface: storageImplementation, networkInterface: networkImplementation, cryptoInterface: cryptoImplementation, tokenBindingKeyManager, clientCredentials, libraryInfo, telemetry, serverTelemetryManager, persistencePlugin, serializableCache }) {
		const loggerOptions = {
			...DEFAULT_LOGGER_IMPLEMENTATION,
			...userLoggerOption
		};
		const resolvedTokenBindingKeyManager = tokenBindingKeyManager || DEFAULT_TOKEN_BINDING_KEY_MANAGER;
		return {
			authOptions: buildAuthOptions(userAuthOptions),
			systemOptions: {
				...DEFAULT_SYSTEM_OPTIONS$1,
				...userSystemOptions
			},
			loggerOptions,
			storageInterface: storageImplementation || new DefaultStorageClass(userAuthOptions.clientId, DEFAULT_CRYPTO_IMPLEMENTATION, new Logger(loggerOptions, name$1, version$1), new StubPerformanceClient(), void 0, resolvedTokenBindingKeyManager),
			networkInterface: networkImplementation || DEFAULT_NETWORK_IMPLEMENTATION,
			cryptoInterface: cryptoImplementation || DEFAULT_CRYPTO_IMPLEMENTATION,
			tokenBindingKeyManager: resolvedTokenBindingKeyManager,
			clientCredentials: clientCredentials || DEFAULT_CLIENT_CREDENTIALS,
			libraryInfo: {
				...DEFAULT_LIBRARY_INFO,
				...libraryInfo
			},
			telemetry: {
				...DEFAULT_TELEMETRY_OPTIONS$1,
				...telemetry
			},
			serverTelemetryManager: serverTelemetryManager || null,
			persistencePlugin: persistencePlugin || null,
			serializableCache: serializableCache || null
		};
	}
	/**
	* Construct authoptions from the client and platform passed values
	* @param authOptions
	*/
	function buildAuthOptions(authOptions) {
		return {
			clientCapabilities: [],
			azureCloudOptions: DEFAULT_AZURE_CLOUD_OPTIONS,
			instanceAware: false,
			isMcp: false,
			...authOptions
		};
	}
	/**
	* Returns true if config has protocolMode set to ProtocolMode.OIDC, false otherwise
	* @param ClientConfiguration
	*/
	function isOidcProtocolMode(config) {
		return config.authOptions.authority.options.protocolMode === ProtocolMode.OIDC;
	}
	/*! @azure/msal-common v16.14.3 2026-10-21 */
	/**
	* This class instance helps track the memory changes facilitating
	* decisions to read from and write to the persistent cache
	*/ var TokenCacheContext = class {
		constructor(tokenCache, hasChanged) {
			this.cache = tokenCache;
			this.hasChanged = hasChanged;
		}
		/**
		* boolean which indicates the changes in cache
		*/
		get cacheHasChanged() {
			return this.hasChanged;
		}
		/**
		* function to retrieve the token cache
		*/
		get tokenCache() {
			return this.cache;
		}
	};
	/*! @azure/msal-common v16.14.3 2026-10-21 */
	/**
	* Error thrown when there is an error in the client code running on the browser.
	*/
	var JoseHeaderError = class JoseHeaderError extends AuthError {
		constructor(errorCode, correlationId, errorMessage) {
			super(errorCode, correlationId, errorMessage);
			this.name = "JoseHeaderError";
			Object.setPrototypeOf(this, JoseHeaderError.prototype);
		}
	};
	/** Returns JoseHeaderError object */
	function createJoseHeaderError(code, correlationId) {
		return new JoseHeaderError(code, correlationId);
	}
	/*! @azure/msal-common v16.14.3 2026-10-21 */
	/**
	* Checks whether a value is a plain JSON-like object.
	* Allows objects with null prototypes, but rejects arrays and object subclasses.
	*/
	function isPlainObject(value) {
		if (typeof value !== "object" || value === null || Object.prototype.toString.call(value) !== "[object Object]") return false;
		if (Object.getPrototypeOf(value) === null) return true;
		let proto = value;
		while (Object.getPrototypeOf(proto) !== null) proto = Object.getPrototypeOf(proto);
		return Object.getPrototypeOf(value) === proto;
	}
	/*! @azure/msal-common v16.14.3 2026-10-21 */
	const missingKidError = "missing_kid_error";
	const missingAlgError = "missing_alg_error";
	const missingJwkError = "missing_jwk_error";
	const invalidJwkError = "invalid_jwk_error";
	/*! @azure/msal-common v16.14.3 2026-10-21 */
	/** @internal */
	var JoseHeader = class JoseHeader {
		constructor(options, correlationId) {
			if (typeof options.alg !== "string" || !options.alg) throw createJoseHeaderError(missingAlgError, correlationId);
			this.typ = options.typ;
			this.alg = options.alg;
			this.kid = options.kid;
			this.jwk = options.jwk;
		}
		/**
		* Builds SignedHttpRequest formatted JOSE Header from the
		* JOSE Header options provided or previously set on the object.
		* Throws if keyId or algorithm aren't provided since they are required for Access Token Binding.
		* @param shrHeaderOptions
		* @param correlationId
		* @returns
		*/
		static getShrHeader(shrHeaderOptions, correlationId) {
			if (!shrHeaderOptions.kid) throw createJoseHeaderError(missingKidError, correlationId);
			if (!shrHeaderOptions.alg) throw createJoseHeaderError(missingAlgError, correlationId);
			return new JoseHeader({
				typ: shrHeaderOptions.typ || JsonWebTokenTypes.Pop,
				kid: shrHeaderOptions.kid,
				alg: shrHeaderOptions.alg
			}, correlationId);
		}
		/**
		* Builds a DPoP formatted JOSE Header from the JOSE Header options provided.
		* Throws if public JWK or algorithm aren't provided since they are required for DPoP.
		* @param dpopHeaderOptions
		* @param correlationId
		* @returns
		*/
		static getDpopHeader(dpopHeaderOptions, correlationId) {
			if (!isPlainObject(dpopHeaderOptions.jwk)) throw createJoseHeaderError(missingJwkError, correlationId);
			if (!dpopHeaderOptions.alg) throw createJoseHeaderError(missingAlgError, correlationId);
			if (Object.keys(dpopHeaderOptions.jwk).length === 0) throw createJoseHeaderError(invalidJwkError, correlationId);
			return new JoseHeader({
				typ: JsonWebTokenTypes.Dpop,
				alg: dpopHeaderOptions.alg,
				jwk: dpopHeaderOptions.jwk
			}, correlationId);
		}
	};
	/*! @azure/msal-common v16.14.3 2026-10-21 */
	const KeyLocation = { SW: "sw" };
	const SHR_TOKEN_BINDING_KEY_TYPE = "shr";
	const SHR_TOKEN_BINDING_KEY_ALGORITHM = JsonWebTokenAlgorithms.RS256;
	/** @internal */
	var PopTokenGenerator = class {
		constructor(cryptoUtils, tokenBindingKeyManager, performanceClient) {
			this.cryptoUtils = cryptoUtils;
			this.tokenBindingKeyManager = tokenBindingKeyManager;
			this.performanceClient = performanceClient;
		}
		/**
		* Generates the req_cnf validated at the RP in the POP protocol for SHR parameters
		* and returns an object containing the keyid, the full req_cnf string and the req_cnf string hash
		* @param request
		* @returns
		*/
		async generateCnf(request, logger) {
			const reqCnf = await invokeAsync(this.generateKid.bind(this), PopTokenGenerateCnf, logger, this.performanceClient, request.correlationId)(request);
			const reqCnfString = this.cryptoUtils.base64UrlEncode(JSON.stringify(reqCnf));
			return {
				kid: reqCnf.kid,
				reqCnfString
			};
		}
		/**
		* Generates key_id for a SHR token request
		* @param request
		* @returns
		*/
		async generateKid(request) {
			return {
				kid: await this.tokenBindingKeyManager.provisionTokenBindingKey({
					correlationId: request.correlationId,
					tokenBindingKeyType: SHR_TOKEN_BINDING_KEY_TYPE,
					tokenBindingKeyAlgorithm: SHR_TOKEN_BINDING_KEY_ALGORITHM
				}),
				xms_ksl: KeyLocation.SW
			};
		}
		/**
		* Signs the POP access_token with the local generated key-pair
		* @param accessToken
		* @param request
		* @returns
		*/
		async signPopToken(accessToken, keyId, request) {
			return this.signPayload(accessToken, keyId, request);
		}
		/**
		* Utility function to generate the signed JWT for an access_token
		* @param payload
		* @param kid
		* @param request
		* @param claims
		* @returns
		*/
		async signPayload(payload, keyId, request, claims) {
			const { resourceRequestMethod, resourceRequestUri, shrClaims, shrNonce, shrOptions } = request;
			const resourceUrlComponents = (resourceRequestUri ? new UrlString(resourceRequestUri, request.correlationId) : void 0)?.getUrlComponents();
			const publicKeyJwk = await this.tokenBindingKeyManager.getTokenBindingPublicKeyJwk(keyId, request.correlationId);
			const encodedKeyIdThumbprint = this.cryptoUtils.base64UrlEncode(JSON.stringify({ kid: keyId }));
			const shrAlgorithm = shrOptions?.header?.alg || publicKeyJwk.alg || SHR_TOKEN_BINDING_KEY_ALGORITHM;
			const shrHeader = JoseHeader.getShrHeader({
				...shrOptions?.header,
				alg: shrAlgorithm,
				kid: encodedKeyIdThumbprint
			}, request.correlationId);
			const shrPayload = {
				at: payload,
				ts: nowSeconds(),
				m: resourceRequestMethod?.toUpperCase(),
				u: resourceUrlComponents?.HostNameAndPort,
				nonce: shrNonce || this.cryptoUtils.createNewGuid(),
				p: resourceUrlComponents?.AbsolutePath,
				q: resourceUrlComponents?.QueryString ? [[], resourceUrlComponents.QueryString] : void 0,
				client_claims: shrClaims || void 0,
				...claims,
				cnf: { jwk: publicKeyJwk }
			};
			return this.cryptoUtils.signTokenBindingJwt(shrHeader, shrPayload, keyId, request.correlationId);
		}
	};
	/*! @azure/msal-common v16.14.3 2026-10-21 */
	const DPOP_HTM_REGEX = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
	const DPOP_TOKEN_BINDING_KEY_TYPE = "dpop";
	const DPOP_JWT_HEADER_ALGORITHM = JsonWebTokenAlgorithms.ES256;
	function buildProofHeader(publicJwk, correlationId) {
		return JoseHeader.getDpopHeader({
			alg: DPOP_JWT_HEADER_ALGORITHM,
			jwk: publicJwk
		}, correlationId);
	}
	function normalizeHtm(htm, correlationId) {
		if (typeof htm !== "string" || !DPOP_HTM_REGEX.test(htm)) throw createClientConfigurationError(invalidDpopHtm, correlationId);
		return htm.toUpperCase();
	}
	/**
	* Normalizes a URL for use as the DPoP htu claim.
	* Per RFC 9449 §4.2, htu is the target URI without query and fragment components.
	* WHATWG URL serialization handles RFC 3986 syntax- and scheme-based normalization
	* such as lowercasing scheme/host and eliding default ports.
	*/
	function normalizeHtu(url, correlationId) {
		let parsedUrl;
		try {
			parsedUrl = new URL(url);
		} catch {
			throw createClientConfigurationError(urlParseError, correlationId);
		}
		if (!/^https:\/\//i.test(url) || parsedUrl.protocol !== "https:" || parsedUrl.username || parsedUrl.password) throw createClientConfigurationError(invalidDpopHtu, correlationId);
		parsedUrl.search = "";
		parsedUrl.hash = "";
		return parsedUrl.href;
	}
	function validateDpopNonce(nonce, correlationId) {
		if (nonce !== void 0 && nonce.trim().length === 0) throw createClientConfigurationError(invalidDpopNonce, correlationId);
	}
	/**
	* Builds RFC 9449 DPoP proof JWT payloads for token-endpoint and
	* resource-endpoint proof bindings.
	*
	* Not exported from any public package entry point.
	* This helper is internal-only until DPoP is wired into acquisition flows
	* in a subsequent work item.
	*
	* DPoP proofs do not contain SHR fields (at, ts, m, u, p, q).
	* @internal
	*/
	var DpopProofGenerator = class {
		constructor(cryptoUtils, tokenBindingKeyManager) {
			this.cryptoUtils = cryptoUtils;
			this.tokenBindingKeyManager = tokenBindingKeyManager;
		}
		/**
		* Provisions a fresh DPoP key and returns the RFC 7638 JWK thumbprint used
		* as `dpop_jkt`.
		*/
		async generateJkt(correlationId = "") {
			return this.tokenBindingKeyManager.provisionTokenBindingKey({
				tokenBindingKeyType: DPOP_TOKEN_BINDING_KEY_TYPE,
				tokenBindingKeyAlgorithm: DPOP_JWT_HEADER_ALGORITHM,
				correlationId
			});
		}
		/**
		* Builds RFC 9449 claims for a token-endpoint DPoP proof.
		* - htm is always "POST" because token endpoint requests use HTTP POST (RFC 9449 §5).
		* - htu is the normalized token endpoint URI (query and fragment stripped).
		* - jti is a fresh CSPRNG-backed unique identifier for every proof.
		*/
		buildTokenProofClaims(params, correlationId = "") {
			validateDpopNonce(params.nonce, correlationId);
			const claims = {
				jti: this.cryptoUtils.createNewGuid(),
				htm: "POST",
				htu: normalizeHtu(params.tokenEndpoint, correlationId),
				iat: nowSeconds()
			};
			if (params.nonce !== void 0) claims.nonce = params.nonce;
			return claims;
		}
		/**
		* Builds and signs a compact DPoP proof JWT for a token-endpoint request.
		*/
		async generateTokenProof(params, keyId, correlationId = "") {
			return this.generateProof(this.buildTokenProofClaims(params, correlationId), keyId, correlationId);
		}
		/**
		* Builds RFC 9449 claims for a resource-endpoint DPoP proof.
		* - htm is uppercased per RFC 9449 §4.2.
		* - htu is the normalized resource URI (query and fragment stripped).
		* - ath is the base64url-encoded SHA-256 hash of the ASCII access token.
		* - jti is a fresh CSPRNG-backed unique identifier for every proof.
		*/
		buildResourceProofClaims(params, correlationId = "") {
			validateDpopNonce(params.nonce, correlationId);
			const claims = {
				jti: this.cryptoUtils.createNewGuid(),
				htm: normalizeHtm(params.htm, correlationId),
				htu: normalizeHtu(params.htu, correlationId),
				ath: params.ath,
				iat: nowSeconds()
			};
			if (params.nonce !== void 0) claims.nonce = params.nonce;
			return claims;
		}
		/**
		* Builds and signs a compact DPoP proof JWT for a resource request.
		*/
		async generateResourceProof(params, keyId, correlationId = "") {
			const { htu, htm, nonce } = params;
			if (!htu || !htm) throw createClientConfigurationError(dpopMissingResourceContext, correlationId);
			const ath = await this.cryptoUtils.hashString(params.accessToken);
			return this.generateProof(this.buildResourceProofClaims({
				htu,
				htm,
				ath,
				nonce
			}, correlationId), keyId, correlationId);
		}
		async generateProof(claims, keyId, correlationId) {
			const publicJwk = await this.tokenBindingKeyManager.getTokenBindingPublicKeyJwk(keyId, correlationId);
			return this.cryptoUtils.signTokenBindingJwt(buildProofHeader(publicJwk, correlationId), claims, keyId, correlationId);
		}
	};
	/*! @azure/msal-common v16.14.3 2026-10-21 */
	/**
	* MSAL-defined interaction required error code indicating no tokens are found in cache.
	* @public
	*/
	const noTokensFound = "no_tokens_found";
	/**
	* MSAL-defined error code indicating a native account is unavailable on the platform.
	* @public
	*/
	const nativeAccountUnavailable = "native_account_unavailable";
	/**
	* MSAL-defined error code indicating the refresh token has expired and user interaction is needed.
	* @public
	*/
	const refreshTokenExpired = "refresh_token_expired";
	/**
	* MSAL-defined error code indicating UI/UX is not allowed (e.g., blocked by policy), requiring alternate interaction.
	* @public
	*/
	const uiNotAllowed = "ui_not_allowed";
	/**
	* Server-originated error code indicating interaction is required to complete the request.
	* @public
	*/
	const interactionRequired = "interaction_required";
	/**
	* Server-originated error code indicating user consent is required.
	* @public
	*/
	const consentRequired = "consent_required";
	/**
	* Server-originated error code indicating user login is required.
	* @public
	*/
	const loginRequired = "login_required";
	/**
	* Server-originated error code indicating the token is invalid or corrupted.
	* @public
	*/
	const badToken = "bad_token";
	/**
	* Server-originated error code indicating the user is in an interrupted state and interaction is required.
	* @public
	*/
	const interruptedUser = "interrupted_user";
	var InteractionRequiredAuthErrorCodes = /* @__PURE__ */ Object.freeze({
		__proto__: null,
		badToken,
		consentRequired,
		interactionRequired,
		interruptedUser,
		loginRequired,
		nativeAccountUnavailable,
		noTokensFound,
		refreshTokenExpired,
		uiNotAllowed
	});
	/*! @azure/msal-common v16.14.3 2026-10-21 */
	/**
	* InteractionRequiredServerErrorMessage contains string constants used by error codes and messages returned by the server indicating interaction is required
	*/
	const InteractionRequiredServerErrorMessage = [
		interactionRequired,
		consentRequired,
		loginRequired,
		badToken,
		uiNotAllowed,
		interruptedUser
	];
	const InteractionRequiredAuthSubErrorMessage = [
		"message_only",
		"additional_action",
		"basic_action",
		"user_password_expired",
		"consent_required",
		"bad_token",
		"ui_not_allowed",
		"interrupted_user"
	];
	/**
	* Error thrown when user interaction is required.
	*/
	var InteractionRequiredAuthError = class InteractionRequiredAuthError extends AuthError {
		constructor(errorCode, correlationId, errorMessage, subError, timestamp, traceId, claims, errorNo) {
			super(errorCode, correlationId, errorMessage, subError);
			Object.setPrototypeOf(this, InteractionRequiredAuthError.prototype);
			this.timestamp = timestamp || "";
			this.traceId = traceId || "";
			this.claims = claims || "";
			this.name = "InteractionRequiredAuthError";
			this.errorNo = errorNo;
		}
	};
	/**
	* Helper function used to determine if an error thrown by the server requires interaction to resolve
	* @param errorCode
	* @param errorString
	* @param subError
	*/
	function isInteractionRequiredError(errorCode, errorString, subError) {
		const isInteractionRequiredErrorCode = !!errorCode && InteractionRequiredServerErrorMessage.indexOf(errorCode) > -1;
		const isInteractionRequiredSubError = !!subError && InteractionRequiredAuthSubErrorMessage.indexOf(subError) > -1;
		const isInteractionRequiredErrorDesc = !!errorString && InteractionRequiredServerErrorMessage.some((irErrorCode) => {
			return errorString.indexOf(irErrorCode) > -1;
		});
		return isInteractionRequiredErrorCode || isInteractionRequiredErrorDesc || isInteractionRequiredSubError;
	}
	/**
	* Creates an InteractionRequiredAuthError
	*/
	function createInteractionRequiredAuthError(errorCode, correlationId, errorMessage) {
		return new InteractionRequiredAuthError(errorCode, correlationId, errorMessage);
	}
	/*! @azure/msal-common v16.14.3 2026-10-21 */
	/**
	* Error thrown when there is an error with the server code, for example, unavailability.
	*/
	var ServerError = class ServerError extends AuthError {
		constructor(errorCode, correlationId, errorMessage, subError, errorNo, status) {
			super(errorCode, correlationId, errorMessage, subError);
			this.name = "ServerError";
			this.errorNo = errorNo;
			this.status = status;
			Object.setPrototypeOf(this, ServerError.prototype);
		}
	};
	/*! @azure/msal-common v16.14.3 2026-10-21 */
	/**
	* Parses the state into the RequestStateObject, which contains the LibraryState info and the state passed by the user.
	* @param base64Decode
	* @param state
	* @param correlationId
	*/
	function parseRequestState(base64Decode, state, correlationId) {
		if (!base64Decode) throw createClientAuthError(noCryptoObject, correlationId);
		if (!state) throw createClientAuthError(invalidState, correlationId);
		try {
			const splitState = state.split(RESOURCE_DELIM);
			const libraryState = splitState[0];
			const userState = splitState.length > 1 ? splitState.slice(1).join(RESOURCE_DELIM) : "";
			const libraryStateString = base64Decode(libraryState);
			const libraryStateObj = JSON.parse(libraryStateString);
			return {
				userRequestState: userState || "",
				libraryState: libraryStateObj
			};
		} catch (e) {
			throw createClientAuthError(invalidState, correlationId);
		}
	}
	/*! @azure/msal-common v16.14.3 2026-10-21 */
	/**
	* Class that handles response parsing.
	* @internal
	*/
	var ResponseHandler = class ResponseHandler {
		constructor(clientId, cacheStorage, cryptoObj, logger, performanceClient, serializableCache, persistencePlugin, tokenBindingKeyManager = DEFAULT_TOKEN_BINDING_KEY_MANAGER) {
			this.clientId = clientId;
			this.cacheStorage = cacheStorage;
			this.cryptoObj = cryptoObj;
			this.tokenBindingKeyManager = tokenBindingKeyManager;
			this.logger = logger;
			this.performanceClient = performanceClient;
			this.serializableCache = serializableCache;
			this.persistencePlugin = persistencePlugin;
		}
		/**
		* Function which validates server authorization token response.
		* @param serverResponse
		* @param correlationId
		* @param refreshAccessToken
		*/
		validateTokenResponse(serverResponse, correlationId, refreshAccessToken) {
			if (serverResponse.error || serverResponse.error_description || serverResponse.suberror) {
				const errString = `Error(s): ${serverResponse.error_codes || NOT_AVAILABLE} - Timestamp: ${serverResponse.timestamp || NOT_AVAILABLE} - Description: ${serverResponse.error_description || NOT_AVAILABLE} - Correlation ID: ${serverResponse.correlation_id || NOT_AVAILABLE} - Trace ID: ${serverResponse.trace_id || NOT_AVAILABLE}`;
				const serverErrorNo = serverResponse.error_codes?.length ? serverResponse.error_codes[0] : void 0;
				const serverError = new ServerError(serverResponse.error || "", serverResponse.correlation_id || "", errString, serverResponse.suberror, serverErrorNo, serverResponse.status);
				if (refreshAccessToken && serverResponse.status && serverResponse.status >= HTTP_SERVER_ERROR_RANGE_START && serverResponse.status <= HTTP_SERVER_ERROR_RANGE_END) {
					this.logger.warning(`executeTokenRequest:validateTokenResponse - AAD is currently unavailable and the access token is unable to be refreshed.\n${serverError}`, correlationId);
					return;
				} else if (refreshAccessToken && serverResponse.status && serverResponse.status >= HTTP_CLIENT_ERROR_RANGE_START && serverResponse.status <= HTTP_CLIENT_ERROR_RANGE_END) {
					this.logger.warning(`executeTokenRequest:validateTokenResponse - AAD is currently available but is unable to refresh the access token.\n${serverError}`, correlationId);
					return;
				}
				if (isInteractionRequiredError(serverResponse.error, serverResponse.error_description, serverResponse.suberror)) throw new InteractionRequiredAuthError(serverResponse.error || "", serverResponse.correlation_id || "", serverResponse.error_description, serverResponse.suberror, serverResponse.timestamp || "", serverResponse.trace_id || "", serverResponse.claims || "", serverErrorNo);
				throw serverError;
			}
		}
		/**
		* Returns a constructed token response based on given string. Also manages the cache updates and cleanups.
		* @param serverTokenResponse
		* @param authority
		*/
		async handleServerTokenResponse(serverTokenResponse, authority, reqTimestamp, request, apiId, authCodePayload, userAssertionHash, handlingRefreshTokenResponse, forceCacheRefreshTokenResponse, serverRequestId, additionalCacheKeyComponents) {
			let idTokenClaims;
			if (serverTokenResponse.id_token) idTokenClaims = extractTokenClaims(serverTokenResponse.id_token || "", this.cryptoObj.base64Decode, request.correlationId);
			if (authCodePayload && Object.prototype.hasOwnProperty.call(authCodePayload, "nonce")) {
				const expectedNonce = authCodePayload.nonce;
				const tokenNonce = idTokenClaims?.nonce;
				if (tokenNonce !== void 0 && expectedNonce === void 0) {
					this.logger.warning("Authorization code response contains an ID Token nonce, but no expected nonce was supplied. Rejecting the response.", request.correlationId);
					throw createClientAuthError(nonceMismatch, request.correlationId);
				}
				if (expectedNonce !== void 0 && (typeof expectedNonce !== "string" || typeof tokenNonce !== "string" || expectedNonce !== tokenNonce)) throw createClientAuthError(nonceMismatch, request.correlationId);
			}
			this.homeAccountIdentifier = generateHomeAccountId(serverTokenResponse.client_info || "", authority.authorityType, this.logger, this.cryptoObj, request.correlationId, idTokenClaims);
			let requestStateObj;
			if (!!authCodePayload && !!authCodePayload.state) requestStateObj = parseRequestState(this.cryptoObj.base64Decode, authCodePayload.state, request.correlationId);
			serverTokenResponse.key_id = serverTokenResponse.key_id || request.dpopJkt || request.sshKid || void 0;
			if (request.authenticationScheme === AuthenticationScheme.DPOP) {
				if (serverTokenResponse.token_type?.toLowerCase() !== AuthenticationScheme.DPOP.toLowerCase()) {
					this.performanceClient?.addFields({ dpopTokenTypeMismatch: serverTokenResponse.token_type }, request.correlationId);
					throw createClientAuthError(dpopTokenTypeMismatch, request.correlationId);
				}
				serverTokenResponse.token_type = AuthenticationScheme.DPOP;
			}
			const attributeTokenPartition = serializeAttributeTokens(request.attributeTokens);
			const cacheKeyComponents = additionalCacheKeyComponents ?? (attributeTokenPartition ? { attribute_tokens: attributeTokenPartition } : void 0);
			const cacheRecord = this.generateCacheRecord(serverTokenResponse, authority, reqTimestamp, request, idTokenClaims, userAssertionHash, authCodePayload, cacheKeyComponents);
			let cacheContext;
			try {
				if (this.persistencePlugin && this.serializableCache) {
					this.logger.verbose("Persistence enabled, calling beforeCacheAccess", request.correlationId);
					cacheContext = new TokenCacheContext(this.serializableCache, true);
					await this.persistencePlugin.beforeCacheAccess(cacheContext);
				}
				if (handlingRefreshTokenResponse && !forceCacheRefreshTokenResponse && cacheRecord.account) {
					if (this.cacheStorage.getAllAccounts({
						homeAccountId: cacheRecord.account.homeAccountId,
						environment: cacheRecord.account.environment
					}, request.correlationId).length < 1) {
						this.logger.warning("Account used to refresh tokens not in persistence, refreshed tokens will not be stored in the cache", request.correlationId);
						this.performanceClient?.addFields({ acntLoggedOut: true }, request.correlationId);
						return await ResponseHandler.generateAuthenticationResult(this.cryptoObj, authority, cacheRecord, false, request, this.performanceClient, {
							idTokenClaims,
							requestState: requestStateObj,
							requestId: serverRequestId,
							tokenBindingKeyManager: this.tokenBindingKeyManager
						});
					}
				}
				await this.cacheStorage.saveCacheRecord(cacheRecord, request.correlationId, isKmsi(idTokenClaims || {}), apiId, request.storeInCache);
			} finally {
				if (this.persistencePlugin && this.serializableCache && cacheContext) {
					this.logger.verbose("Persistence enabled, calling afterCacheAccess", request.correlationId);
					await this.persistencePlugin.afterCacheAccess(cacheContext);
				}
			}
			return ResponseHandler.generateAuthenticationResult(this.cryptoObj, authority, cacheRecord, false, request, this.performanceClient, {
				idTokenClaims,
				requestState: requestStateObj,
				serverTokenResponse,
				requestId: serverRequestId,
				tokenBindingKeyManager: this.tokenBindingKeyManager
			});
		}
		/**
		* Generates CacheRecord
		* @param serverTokenResponse
		* @param idTokenObj
		* @param authority
		*/
		generateCacheRecord(serverTokenResponse, authority, reqTimestamp, request, idTokenClaims, userAssertionHash, authCodePayload, additionalCacheKeyComponents) {
			const env = authority.getPreferredCache();
			if (!env) throw createClientAuthError(invalidCacheEnvironment, request.correlationId);
			const claimsTenantId = getTenantIdFromIdTokenClaims(idTokenClaims);
			let cachedIdToken;
			let cachedAccount;
			if (serverTokenResponse.id_token && !!idTokenClaims) {
				cachedIdToken = createIdTokenEntity(this.homeAccountIdentifier, env, serverTokenResponse.id_token, this.clientId, claimsTenantId || "");
				cachedAccount = buildAccountToCache(this.cacheStorage, authority, this.homeAccountIdentifier, this.cryptoObj.base64Decode, request.correlationId, idTokenClaims, serverTokenResponse.client_info, env, claimsTenantId, authCodePayload, void 0, this.logger, this.performanceClient);
			}
			let cachedAccessToken = null;
			if (serverTokenResponse.access_token) {
				const responseScopes = serverTokenResponse.scope ? ScopeSet.fromString(serverTokenResponse.scope, request.correlationId) : new ScopeSet(request.scopes || [], request.correlationId);
				const expiresIn = (typeof serverTokenResponse.expires_in === "string" ? parseInt(serverTokenResponse.expires_in, 10) : serverTokenResponse.expires_in) || 0;
				const extExpiresIn = (typeof serverTokenResponse.ext_expires_in === "string" ? parseInt(serverTokenResponse.ext_expires_in, 10) : serverTokenResponse.ext_expires_in) || 0;
				const refreshIn = (typeof serverTokenResponse.refresh_in === "string" ? parseInt(serverTokenResponse.refresh_in, 10) : serverTokenResponse.refresh_in) || void 0;
				const tokenExpirationSeconds = reqTimestamp + expiresIn;
				const extendedTokenExpirationSeconds = tokenExpirationSeconds + extExpiresIn;
				const refreshOnSeconds = refreshIn && refreshIn > 0 ? reqTimestamp + refreshIn : void 0;
				cachedAccessToken = createAccessTokenEntity(this.homeAccountIdentifier, env, serverTokenResponse.access_token, this.clientId, claimsTenantId || authority.tenant || "", responseScopes.printScopes(), tokenExpirationSeconds, extendedTokenExpirationSeconds, this.cryptoObj.base64Decode, request.correlationId, refreshOnSeconds, serverTokenResponse.token_type, userAssertionHash, serverTokenResponse.key_id, additionalCacheKeyComponents);
				const resource = request.resource || null;
				if (resource) cachedAccessToken.resource = resource;
			}
			let cachedRefreshToken = null;
			if (serverTokenResponse.refresh_token) {
				let rtExpiresOn;
				if (serverTokenResponse.refresh_token_expires_in) {
					rtExpiresOn = reqTimestamp + (typeof serverTokenResponse.refresh_token_expires_in === "string" ? parseInt(serverTokenResponse.refresh_token_expires_in, 10) : serverTokenResponse.refresh_token_expires_in);
					this.performanceClient?.addFields({ ntwkRtExpiresOnSeconds: rtExpiresOn }, request.correlationId);
				}
				cachedRefreshToken = createRefreshTokenEntity(this.homeAccountIdentifier, env, serverTokenResponse.refresh_token, this.clientId, serverTokenResponse.foci, userAssertionHash, rtExpiresOn);
			}
			let cachedAppMetadata = null;
			if (serverTokenResponse.foci) cachedAppMetadata = {
				clientId: this.clientId,
				environment: env,
				familyId: serverTokenResponse.foci
			};
			return {
				account: cachedAccount,
				idToken: cachedIdToken,
				accessToken: cachedAccessToken,
				refreshToken: cachedRefreshToken,
				appMetadata: cachedAppMetadata
			};
		}
		/**
		* Creates an @AuthenticationResult from @CacheRecord , @IdToken , and a boolean that states whether or not the result is from cache.
		*
		* Optionally takes a state string that is set as-is in the response.
		*
		* @param cacheRecord
		* @param idTokenObj
		* @param fromTokenCache
		* @param stateString
		*/
		static async generateAuthenticationResult(cryptoObj, authority, cacheRecord, fromTokenCache, request, performanceClient, options = {}) {
			const { idTokenClaims, requestState, serverTokenResponse, requestId, tokenBindingKeyManager = DEFAULT_TOKEN_BINDING_KEY_MANAGER } = options;
			let accessToken = "";
			let responseScopes = [];
			let expiresOn = null;
			let extExpiresOn;
			let refreshOn;
			let familyId = "";
			let dpopProof;
			if (cacheRecord.accessToken) {
				const accessTokenType = cacheRecord.accessToken.tokenType?.toLowerCase();
				if (cacheRecord.accessToken.tokenType === AuthenticationScheme.POP && !request.popKid) {
					const popTokenGenerator = new PopTokenGenerator(cryptoObj, tokenBindingKeyManager, performanceClient);
					const { secret, keyId } = cacheRecord.accessToken;
					if (!keyId) throw createClientAuthError(keyIdMissing, request.correlationId);
					accessToken = await popTokenGenerator.signPopToken(secret, keyId, request);
				} else accessToken = cacheRecord.accessToken.secret;
				if (accessTokenType === AuthenticationScheme.DPOP.toLowerCase()) {
					if (!cacheRecord.accessToken.keyId) throw createClientAuthError(keyIdMissing, request.correlationId);
					dpopProof = await new DpopProofGenerator(cryptoObj, tokenBindingKeyManager).generateResourceProof({
						htu: request.resourceRequestUri,
						htm: request.resourceRequestMethod,
						accessToken: cacheRecord.accessToken.secret
					}, cacheRecord.accessToken.keyId, request.correlationId);
				}
				responseScopes = ScopeSet.fromString(cacheRecord.accessToken.target, request.correlationId).asArray();
				expiresOn = toDateFromSeconds(cacheRecord.accessToken.expiresOn);
				extExpiresOn = toDateFromSeconds(cacheRecord.accessToken.extendedExpiresOn);
				if (cacheRecord.accessToken.refreshOn) refreshOn = toDateFromSeconds(cacheRecord.accessToken.refreshOn);
			}
			if (cacheRecord.appMetadata) familyId = cacheRecord.appMetadata.familyId === THE_FAMILY_ID ? THE_FAMILY_ID : "";
			const uid = idTokenClaims?.oid || idTokenClaims?.sub || "";
			const tid = idTokenClaims?.tid || "";
			const regionSubScope = idTokenClaims?.tenant_region_sub_scope;
			if (typeof regionSubScope === "string") performanceClient?.addFields({ regionSubScope }, request.correlationId);
			if (serverTokenResponse?.spa_accountid && !!cacheRecord.account) {
				cacheRecord.account.nativeAccountId = serverTokenResponse?.spa_accountid;
				const targetTenantId = tid || cacheRecord.account.realm;
				if (cacheRecord.account.tenantProfiles) {
					const matchingProfile = cacheRecord.account.tenantProfiles.find((tp) => tp.tenantId === targetTenantId);
					if (matchingProfile) matchingProfile.nativeAccountId = serverTokenResponse.spa_accountid;
				}
			}
			const accountInfo = cacheRecord.account ? updateAccountTenantProfileData(getAccountInfo(cacheRecord.account), void 0, idTokenClaims, cacheRecord.idToken?.secret) : null;
			return {
				authority: authority.canonicalAuthority,
				uniqueId: uid,
				tenantId: tid,
				scopes: responseScopes,
				account: accountInfo,
				idToken: cacheRecord?.idToken?.secret || "",
				idTokenClaims: idTokenClaims || {},
				accessToken,
				dpopProof,
				fromCache: fromTokenCache,
				expiresOn,
				extExpiresOn,
				refreshOn,
				correlationId: request.correlationId,
				requestId: requestId || "",
				familyId,
				tokenType: cacheRecord.accessToken?.tokenType?.toLowerCase() === AuthenticationScheme.DPOP.toLowerCase() ? AuthenticationScheme.DPOP : cacheRecord.accessToken?.tokenType || "",
				state: requestState ? requestState.userRequestState : "",
				cloudGraphHostName: cacheRecord.account?.cloudGraphHostName || "",
				msGraphHost: cacheRecord.account?.msGraphHost || "",
				code: serverTokenResponse?.spa_code,
				fromPlatformBroker: false
			};
		}
	};
	/** @internal */
	function buildAccountToCache(cacheStorage, authority, homeAccountId, base64Decode, correlationId, idTokenClaims, clientInfo, environment, claimsTenantId, authCodePayload, nativeAccountId, logger, performanceClient) {
		logger?.verbose("setCachedAccount called", correlationId);
		const accountEnvironment = environment || authority.getPreferredCache();
		const matchedAccounts = cacheStorage.getAccountsFilteredBy({
			homeAccountId,
			environment: accountEnvironment
		}, correlationId);
		performanceClient?.addFields({ cacheMatchedAccounts: matchedAccounts.length }, correlationId);
		if (matchedAccounts.length > 1) logger?.warning("Multiple base accounts matched homeAccountId. Ignoring cached account and creating a new base account.", correlationId);
		const baseAccount = (matchedAccounts.length === 1 ? matchedAccounts[0] : null) || createAccountEntity({
			homeAccountId,
			idTokenClaims,
			clientInfo,
			environment,
			cloudGraphHostName: authCodePayload?.cloud_graph_host_name,
			msGraphHost: authCodePayload?.msgraph_host,
			nativeAccountId
		}, authority, correlationId, base64Decode);
		const tenantProfiles = baseAccount.tenantProfiles || [];
		const tenantId = claimsTenantId || baseAccount.realm;
		if (tenantId && !tenantProfiles.find((tenantProfile) => {
			return tenantProfile.tenantId === tenantId;
		})) {
			const newTenantProfile = buildTenantProfile(homeAccountId, baseAccount.localAccountId, tenantId, nativeAccountId, idTokenClaims);
			tenantProfiles.push(newTenantProfile);
		}
		baseAccount.tenantProfiles = tenantProfiles;
		return baseAccount;
	}
	/*! @azure/msal-common v16.14.3 2026-10-21 */
	const CcsCredentialType = {
		HOME_ACCOUNT_ID: "home_account_id",
		UPN: "UPN"
	};
	/*! @azure/msal-common v16.14.3 2026-10-21 */
	async function getClientAssertion(clientAssertion, clientId, tokenEndpoint, fmiPath) {
		if (typeof clientAssertion === "string") return clientAssertion;
		else return clientAssertion({
			clientId,
			tokenEndpoint,
			fmiPath
		});
	}
	/*! @azure/msal-common v16.14.3 2026-10-21 */
	function getRequestThumbprint(clientId, request, homeAccountId) {
		return {
			clientId,
			authority: request.authority,
			scopes: request.scopes,
			homeAccountIdentifier: homeAccountId,
			claims: request.claims,
			authenticationScheme: request.authenticationScheme,
			resourceRequestMethod: request.resourceRequestMethod,
			resourceRequestUri: request.resourceRequestUri,
			shrClaims: request.shrClaims,
			sshKid: request.sshKid,
			embeddedClientId: request.embeddedClientId || request.extraParameters?.clientId,
			resource: request.resource,
			attributeTokens: serializeAttributeTokens(request.attributeTokens)
		};
	}
	/*! @azure/msal-common v16.14.3 2026-10-21 */
	/** @internal */
	var ThrottlingUtils = class ThrottlingUtils {
		/**
		* Prepares a RequestThumbprint to be stored as a key.
		* @param thumbprint
		*/
		static generateThrottlingStorageKey(thumbprint) {
			return `${THROTTLING_PREFIX}.${JSON.stringify(thumbprint)}`;
		}
		/**
		* Performs necessary throttling checks before a network request.
		* @param cacheManager
		* @param thumbprint
		*/
		static preProcess(cacheManager, thumbprint, correlationId) {
			const key = ThrottlingUtils.generateThrottlingStorageKey(thumbprint);
			const value = cacheManager.getThrottlingCache(key, correlationId);
			if (value) {
				if (value.throttleTime < Date.now()) {
					cacheManager.removeItem(key, correlationId);
					return;
				}
				throw new ServerError(value.errorCodes?.join(" ") || "", correlationId, value.errorMessage, value.subError);
			}
		}
		/**
		* Performs necessary throttling checks after a network request.
		* @param cacheManager
		* @param thumbprint
		* @param response
		*/
		static postProcess(cacheManager, thumbprint, response, correlationId) {
			if (ThrottlingUtils.checkResponseStatus(response) || ThrottlingUtils.checkResponseForRetryAfter(response)) {
				const thumbprintValue = {
					throttleTime: ThrottlingUtils.calculateThrottleTime(parseInt(response.headers[HeaderNames.RETRY_AFTER])),
					error: response.body.error,
					errorCodes: response.body.error_codes,
					errorMessage: response.body.error_description,
					subError: response.body.suberror
				};
				cacheManager.setThrottlingCache(ThrottlingUtils.generateThrottlingStorageKey(thumbprint), thumbprintValue, correlationId);
			}
		}
		/**
		* Checks a NetworkResponse object's status codes against 429 or 5xx
		* @param response
		*/
		static checkResponseStatus(response) {
			return response.status === 429 || response.status >= 500 && response.status < 600;
		}
		/**
		* Checks a NetworkResponse object's RetryAfter header
		* @param response
		*/
		static checkResponseForRetryAfter(response) {
			if (response.headers) return response.headers.hasOwnProperty(HeaderNames.RETRY_AFTER) && (response.status < 200 || response.status >= 300);
			return false;
		}
		/**
		* Calculates the Unix-time value for a throttle to expire given throttleTime in seconds.
		* @param throttleTime
		*/
		static calculateThrottleTime(throttleTime) {
			const time = throttleTime <= 0 ? 0 : throttleTime;
			const currentSeconds = Date.now() / 1e3;
			return Math.floor(Math.min(currentSeconds + (time || DEFAULT_THROTTLE_TIME_SECONDS), currentSeconds + DEFAULT_MAX_THROTTLE_TIME_SECONDS) * 1e3);
		}
		static removeThrottle(cacheManager, clientId, request, homeAccountIdentifier) {
			const thumbprint = getRequestThumbprint(clientId, request, homeAccountIdentifier);
			const key = this.generateThrottlingStorageKey(thumbprint);
			cacheManager.removeItem(key, request.correlationId);
		}
	};
	/*! @azure/msal-common v16.14.3 2026-10-21 */
	/**
	* Represents network related errors
	*/
	var NetworkError = class NetworkError extends AuthError {
		constructor(error, httpStatus, responseHeaders) {
			super(error.errorCode, error.correlationId, error.errorMessage, error.subError);
			Object.setPrototypeOf(this, NetworkError.prototype);
			this.name = "NetworkError";
			this.error = error;
			this.httpStatus = httpStatus;
			this.responseHeaders = responseHeaders;
		}
	};
	/**
	* Creates NetworkError object for a failed network request
	* @param error - Error to be thrown back to the caller
	* @param httpStatus - Status code of the network request
	* @param responseHeaders - Response headers of the network request, when available
	* @returns NetworkError object
	*/
	function createNetworkError(error, httpStatus, responseHeaders, additionalError) {
		error.errorMessage = `${error.errorMessage}, additionalErrorInfo: error.name:${additionalError?.name}, error.message:${additionalError?.message}`;
		return new NetworkError(error, httpStatus, responseHeaders);
	}
	/*! @azure/msal-common v16.14.3 2026-10-21 */
	/**
	* Creates default headers for requests to token endpoint
	*/
	function createTokenRequestHeaders(logger, preventCorsPreflight, ccsCred) {
		const headers = {};
		headers[HeaderNames.CONTENT_TYPE] = URL_FORM_CONTENT_TYPE;
		if (!preventCorsPreflight && ccsCred) switch (ccsCred.type) {
			case CcsCredentialType.HOME_ACCOUNT_ID:
				try {
					const clientInfo = buildClientInfoFromHomeAccountId(ccsCred.credential);
					headers[HeaderNames.CCS_HEADER] = `Oid:${clientInfo.uid}@${clientInfo.utid}`;
				} catch (e) {
					logger.verbose(`Could not parse home account ID for CCS Header: '${e}'`, "");
				}
				break;
			case CcsCredentialType.UPN:
				headers[HeaderNames.CCS_HEADER] = `UPN: ${ccsCred.credential}`;
				break;
		}
		return headers;
	}
	/**
	* Adds the DPoP proof header for token endpoint requests when DPoP is requested.
	* @internal
	*/
	async function addDpopTokenProofHeader(headers, request, tokenEndpoint, cryptoUtils, tokenBindingKeyManager) {
		if (request.authenticationScheme !== AuthenticationScheme.DPOP) return;
		const dpopProofGenerator = new DpopProofGenerator(cryptoUtils, tokenBindingKeyManager);
		const keyId = request.dpopJkt;
		if (!keyId?.trim()) throw createClientAuthError(keyIdMissing, request.correlationId);
		headers[HeaderNames.DPOP] = await dpopProofGenerator.generateTokenProof({ tokenEndpoint }, keyId, request.correlationId);
	}
	/**
	* Creates query string for the /token request
	* @param request
	*/
	function createTokenQueryParameters(request, clientId, redirectUri, performanceClient) {
		const parameters = /* @__PURE__ */ new Map();
		if (request.embeddedClientId) addBrokerParameters(parameters, clientId, redirectUri);
		if (request.extraQueryParameters) addExtraParameters(parameters, request.extraQueryParameters);
		addCorrelationId(parameters, request.correlationId);
		instrumentBrokerParams(parameters, request.correlationId, performanceClient);
		return mapToQueryString(parameters);
	}
	/**
	* Http post to token endpoint
	* @param tokenEndpoint
	* @param queryString
	* @param headers
	* @param thumbprint
	* @internal
	*/
	async function executePostToTokenEndpoint(tokenEndpoint, queryString, headers, thumbprint, correlationId, cacheManager, networkClient, logger, performanceClient, serverTelemetryManager) {
		const response = await sendPostRequest(thumbprint, tokenEndpoint, {
			body: queryString,
			headers
		}, correlationId, cacheManager, networkClient, logger, performanceClient);
		if (serverTelemetryManager && response.status < 500 && response.status !== 429) serverTelemetryManager.clearTelemetryCache();
		return response;
	}
	/**
	* Wraps sendPostRequestAsync with necessary preflight and postflight logic
	* @param thumbprint - Request thumbprint for throttling
	* @param tokenEndpoint - Endpoint to make the POST to
	* @param options - Body and Headers to include on the POST request
	* @param correlationId - CorrelationId for telemetry
	* @param cacheManager - Cache manager instance
	* @param networkClient - Network module instance
	* @param logger - Logger instance
	* @param performanceClient - Performance client instance
	* @internal
	*/
	async function sendPostRequest(thumbprint, tokenEndpoint, options, correlationId, cacheManager, networkClient, logger, performanceClient) {
		ThrottlingUtils.preProcess(cacheManager, thumbprint, correlationId);
		let response;
		try {
			response = await invokeAsync(networkClient.sendPostRequestAsync.bind(networkClient), NetworkClientSendPostRequestAsync, logger, performanceClient, correlationId)(tokenEndpoint, {
				...options,
				correlationId,
				performanceClient
			});
			const responseHeaders = response.headers || {};
			performanceClient?.addFields({
				refreshTokenSize: response.body.refresh_token?.length || 0,
				httpVerToken: responseHeaders[HeaderNames.X_MS_HTTP_VERSION] || "",
				requestId: responseHeaders[HeaderNames.X_MS_REQUEST_ID] || ""
			}, correlationId);
		} catch (e) {
			if (e instanceof NetworkError) {
				const responseHeaders = e.responseHeaders;
				if (responseHeaders) performanceClient?.addFields({
					httpVerToken: responseHeaders[HeaderNames.X_MS_HTTP_VERSION] || "",
					requestId: responseHeaders[HeaderNames.X_MS_REQUEST_ID] || "",
					contentTypeHeader: responseHeaders[HeaderNames.CONTENT_TYPE] || void 0,
					contentLengthHeader: responseHeaders[HeaderNames.CONTENT_LENGTH] || void 0,
					httpStatus: e.httpStatus
				}, correlationId);
				throw e.error;
			}
			if (e instanceof AuthError) throw e;
			else throw createClientAuthError(networkError, correlationId);
		}
		ThrottlingUtils.postProcess(cacheManager, thumbprint, response, correlationId);
		return response;
	}
	/*! @azure/msal-common v16.14.3 2026-10-21 */
	/**
	* Oauth2.0 Authorization Code client
	* @internal
	*/
	var AuthorizationCodeClient = class {
		constructor(configuration, performanceClient) {
			this.includeRedirectUri = true;
			this.config = buildClientConfiguration(configuration);
			this.logger = new Logger(this.config.loggerOptions, name$1, version$1);
			this.cryptoUtils = this.config.cryptoInterface;
			this.cacheManager = this.config.storageInterface;
			this.networkClient = this.config.networkInterface;
			this.serverTelemetryManager = this.config.serverTelemetryManager;
			this.authority = this.config.authOptions.authority;
			this.performanceClient = performanceClient;
			this.oidcDefaultScopes = this.config.authOptions.authority.options.OIDCOptions?.defaultScopes;
		}
		/**
		* API to acquire a token in exchange of 'authorization_code` acquired by the user in the first leg of the
		* authorization_code_grant
		* @param request
		*/
		async acquireToken(request, apiId, authCodePayload) {
			if (!request.code) throw createClientAuthError(requestCannotBeMade, request.correlationId);
			if (authCodePayload && authCodePayload.cloud_instance_host_name) await invokeAsync(this.updateTokenEndpointAuthority.bind(this), UpdateTokenEndpointAuthority, this.logger, this.performanceClient, request.correlationId)(authCodePayload.cloud_instance_host_name, request.correlationId);
			const reqTimestamp = nowSeconds();
			const response = await invokeAsync(this.executeTokenRequest.bind(this), AuthClientExecuteTokenRequest, this.logger, this.performanceClient, request.correlationId)(this.authority, request, this.serverTelemetryManager);
			const requestId = response.headers?.[HeaderNames.X_MS_REQUEST_ID];
			const responseHandler = new ResponseHandler(this.config.authOptions.clientId, this.cacheManager, this.cryptoUtils, this.logger, this.performanceClient, this.config.serializableCache, this.config.persistencePlugin, this.config.tokenBindingKeyManager);
			responseHandler.validateTokenResponse(response.body, request.correlationId);
			return invokeAsync(responseHandler.handleServerTokenResponse.bind(responseHandler), HandleServerTokenResponse, this.logger, this.performanceClient, request.correlationId)(response.body, this.authority, reqTimestamp, request, apiId, authCodePayload, void 0, void 0, void 0, requestId);
		}
		/**
		* Used to log out the current user, and redirect the user to the postLogoutRedirectUri.
		* Default behaviour is to redirect the user to `window.location.href`.
		* @param authorityUri
		*/
		getLogoutUri(logoutRequest) {
			if (!logoutRequest) throw createClientConfigurationError(logoutRequestEmpty, "");
			const queryString = this.createLogoutUrlQueryString(logoutRequest);
			return UrlString.appendQueryString(this.authority.endSessionEndpoint, queryString);
		}
		/**
		* Executes POST request to token endpoint
		* @param authority
		* @param request
		*/
		async executeTokenRequest(authority, request, serverTelemetryManager) {
			const queryParametersString = createTokenQueryParameters(request, this.config.authOptions.clientId, this.config.authOptions.redirectUri, this.performanceClient);
			const endpoint = UrlString.appendQueryString(authority.tokenEndpoint, queryParametersString);
			const requestBody = await invokeAsync(this.createTokenRequestBody.bind(this), AuthClientCreateTokenRequestBody, this.logger, this.performanceClient, request.correlationId)(request);
			let ccsCredential = void 0;
			if (request.clientInfo) try {
				const clientInfo = buildClientInfo(request.clientInfo, this.cryptoUtils.base64Decode);
				ccsCredential = {
					credential: `${clientInfo.uid}${CLIENT_INFO_SEPARATOR}${clientInfo.utid}`,
					type: CcsCredentialType.HOME_ACCOUNT_ID
				};
			} catch (e) {
				this.logger.verbose(`Could not parse client info for CCS Header: '${e}'`, request.correlationId);
			}
			const headers = createTokenRequestHeaders(this.logger, this.config.systemOptions.preventCorsPreflight, ccsCredential || request.ccsCredential);
			await addDpopTokenProofHeader(headers, request, endpoint, this.cryptoUtils, this.config.tokenBindingKeyManager);
			const thumbprint = getRequestThumbprint(this.config.authOptions.clientId, request);
			return invokeAsync(executePostToTokenEndpoint, AuthorizationCodeClientExecutePostToTokenEndpoint, this.logger, this.performanceClient, request.correlationId)(endpoint, requestBody, headers, thumbprint, request.correlationId, this.cacheManager, this.networkClient, this.logger, this.performanceClient, serverTelemetryManager);
		}
		/**
		* Generates a map for all the params to be sent to the service
		* @param request
		*/
		async createTokenRequestBody(request) {
			const parameters = /* @__PURE__ */ new Map();
			addClientId(parameters, request.embeddedClientId || request.extraParameters?.[CLIENT_ID] || this.config.authOptions.clientId);
			if (!this.includeRedirectUri) {
				if (!request.redirectUri) throw createClientConfigurationError(redirectUriEmpty, request.correlationId);
			} else addRedirectUri(parameters, request.redirectUri);
			addScopes(parameters, request.scopes, request.correlationId, true, this.oidcDefaultScopes);
			addResource(parameters, request.resource);
			if (request.attributeTokens) addAttributeTokens(parameters, request.attributeTokens);
			this.performanceClient?.addFields({ hasAttributeTokens: !!request.attributeTokens?.length }, request.correlationId);
			addAuthorizationCode(parameters, request.code);
			addLibraryInfo(parameters, this.config.libraryInfo);
			addApplicationTelemetry(parameters, this.config.telemetry.application);
			addThrottling(parameters);
			if (this.serverTelemetryManager && !isOidcProtocolMode(this.config)) addServerTelemetry(parameters, this.serverTelemetryManager);
			if (request.codeVerifier) addCodeVerifier(parameters, request.codeVerifier);
			if (this.config.clientCredentials.clientSecret) addClientSecret(parameters, this.config.clientCredentials.clientSecret);
			if (this.config.clientCredentials.clientAssertion) {
				const clientAssertion = this.config.clientCredentials.clientAssertion;
				addClientAssertion(parameters, await getClientAssertion(clientAssertion.assertion, this.config.authOptions.clientId, request.resourceRequestUri));
				addClientAssertionType(parameters, clientAssertion.assertionType);
			}
			addGrantType(parameters, GrantType.AUTHORIZATION_CODE_GRANT);
			addClientInfo(parameters);
			if (request.authenticationScheme === AuthenticationScheme.POP) {
				const popTokenGenerator = new PopTokenGenerator(this.cryptoUtils, this.config.tokenBindingKeyManager, this.performanceClient);
				let reqCnfData;
				if (!request.popKid) reqCnfData = (await invokeAsync(popTokenGenerator.generateCnf.bind(popTokenGenerator), PopTokenGenerateCnf, this.logger, this.performanceClient, request.correlationId)(request, this.logger)).reqCnfString;
				else reqCnfData = this.cryptoUtils.encodeKid(request.popKid);
				addPopToken(parameters, reqCnfData);
			} else if (request.authenticationScheme === AuthenticationScheme.SSH) if (request.sshJwk) addSshJwk(parameters, request.sshJwk);
			else throw createClientConfigurationError(missingSshJwk, request.correlationId);
			let ccsCred = void 0;
			if (request.clientInfo) try {
				const clientInfo = buildClientInfo(request.clientInfo, this.cryptoUtils.base64Decode);
				ccsCred = {
					credential: `${clientInfo.uid}${CLIENT_INFO_SEPARATOR}${clientInfo.utid}`,
					type: CcsCredentialType.HOME_ACCOUNT_ID
				};
			} catch (e) {
				this.logger.verbose(`Could not parse client info for CCS Header: '${e}'`, request.correlationId);
			}
			else ccsCred = request.ccsCredential;
			if (this.config.systemOptions.preventCorsPreflight && ccsCred) switch (ccsCred.type) {
				case CcsCredentialType.HOME_ACCOUNT_ID:
					try {
						addCcsOid(parameters, buildClientInfoFromHomeAccountId(ccsCred.credential));
					} catch (e) {
						this.logger.verbose(`Could not parse home account ID for CCS Header: '${e}'`, request.correlationId);
					}
					break;
				case CcsCredentialType.UPN:
					addCcsUpn(parameters, ccsCred.credential);
					break;
			}
			if (request.embeddedClientId) addBrokerParameters(parameters, this.config.authOptions.clientId, this.config.authOptions.redirectUri);
			if (request.extraParameters) addExtraParameters(parameters, request.extraParameters);
			if (request.enableSpaAuthorizationCode && (!request.extraParameters || !request.extraParameters[RETURN_SPA_CODE])) addExtraParameters(parameters, { [RETURN_SPA_CODE]: "1" });
			instrumentBrokerParams(parameters, request.correlationId, this.performanceClient);
			addClaims(parameters, request.correlationId, request.claims, this.config.authOptions.clientCapabilities, request.skipBrokerClaims);
			return mapToQueryString(parameters);
		}
		/**
		* This API validates the `EndSessionRequest` and creates a URL
		* @param request
		*/
		createLogoutUrlQueryString(request) {
			const parameters = /* @__PURE__ */ new Map();
			if (request.postLogoutRedirectUri) addPostLogoutRedirectUri(parameters, request.postLogoutRedirectUri);
			if (request.correlationId) addCorrelationId(parameters, request.correlationId);
			if (request.idTokenHint) addIdTokenHint(parameters, request.idTokenHint);
			if (request.state) addState(parameters, request.state);
			if (request.logoutHint) addLogoutHint(parameters, request.logoutHint);
			if (request.extraQueryParameters) addExtraParameters(parameters, request.extraQueryParameters);
			if (this.config.authOptions.instanceAware) addInstanceAware(parameters);
			return mapToQueryString(parameters);
		}
		/**
		* Updates the authority to the cloud instance provided in the authorization response
		* @param cloudInstanceHostName - cloud instance host name from authorization code payload
		* @param correlationId - request correlation id
		*/
		async updateTokenEndpointAuthority(cloudInstanceHostName, correlationId) {
			this.authority = await createDiscoveredInstance(`https://${cloudInstanceHostName}/${this.authority.tenant}/`, this.networkClient, this.cacheManager, this.authority.options, this.logger, correlationId, this.performanceClient);
		}
	};
	/*! @azure/msal-common v16.14.3 2026-10-21 */
	/**
	* Returns map of parameters that are applicable to all calls to /authorize whether using PKCE or EAR
	* @param config
	* @param request
	* @param logger
	* @param performanceClient
	* @returns
	* @internal
	*/
	function getStandardAuthorizeRequestParameters(authOptions, request, logger, performanceClient) {
		const correlationId = request.correlationId;
		const parameters = /* @__PURE__ */ new Map();
		addClientId(parameters, request.embeddedClientId || request.extraQueryParameters?.[CLIENT_ID] || authOptions.clientId);
		addScopes(parameters, [...request.scopes || [], ...request.extraScopesToConsent || []], request.correlationId, true, authOptions.authority.options.OIDCOptions?.defaultScopes);
		addResource(parameters, request.resource);
		addRedirectUri(parameters, request.redirectUri);
		addCorrelationId(parameters, correlationId);
		addResponseMode(parameters, request.responseMode);
		addClientInfo(parameters);
		addCliData(parameters);
		if (request.prompt) addPrompt(parameters, request.prompt);
		if (request.domainHint) addDomainHint(parameters, request.domainHint);
		if (request.prompt !== PromptValue$1.SELECT_ACCOUNT) {
			if (request.sid && request.prompt === PromptValue$1.NONE) {
				logger.verbose("createAuthCodeUrlQueryString: Prompt is none, adding sid from request", request.correlationId);
				addSid(parameters, request.sid);
			} else if (request.account) {
				const accountSid = extractAccountSid(request.account);
				let accountLoginHintClaim = extractLoginHint(request.account);
				if (accountLoginHintClaim && request.domainHint) {
					logger.warning(`AuthorizationCodeClient.createAuthCodeUrlQueryString: "domainHint" param is set, skipping opaque "login_hint" claim. Please consider not passing domainHint`, request.correlationId);
					accountLoginHintClaim = null;
				}
				if (accountLoginHintClaim) {
					logger.verbose("createAuthCodeUrlQueryString: login_hint claim present on account", request.correlationId);
					addLoginHint(parameters, accountLoginHintClaim);
					try {
						addCcsOid(parameters, buildClientInfoFromHomeAccountId(request.account.homeAccountId));
					} catch (e) {
						logger.verbose("createAuthCodeUrlQueryString: Could not parse home account ID for CCS Header", request.correlationId);
					}
				} else if (accountSid && request.prompt === PromptValue$1.NONE) {
					logger.verbose("createAuthCodeUrlQueryString: Prompt is none, adding sid from account", request.correlationId);
					addSid(parameters, accountSid);
					try {
						addCcsOid(parameters, buildClientInfoFromHomeAccountId(request.account.homeAccountId));
					} catch (e) {
						logger.verbose("createAuthCodeUrlQueryString: Could not parse home account ID for CCS Header", request.correlationId);
					}
				} else if (request.loginHint) {
					logger.verbose("createAuthCodeUrlQueryString: Adding login_hint from request", request.correlationId);
					addLoginHint(parameters, request.loginHint);
					addCcsUpn(parameters, request.loginHint);
				} else if (request.account.username) {
					logger.verbose("createAuthCodeUrlQueryString: Adding login_hint from account", request.correlationId);
					addLoginHint(parameters, request.account.username);
					try {
						addCcsOid(parameters, buildClientInfoFromHomeAccountId(request.account.homeAccountId));
					} catch (e) {
						logger.verbose("createAuthCodeUrlQueryString: Could not parse home account ID for CCS Header", request.correlationId);
					}
				}
			} else if (request.loginHint) {
				logger.verbose("createAuthCodeUrlQueryString: No account, adding login_hint from request", request.correlationId);
				addLoginHint(parameters, request.loginHint);
				addCcsUpn(parameters, request.loginHint);
			}
		} else logger.verbose("createAuthCodeUrlQueryString: Prompt is select_account, ignoring account hints", request.correlationId);
		if (request.nonce) addNonce(parameters, request.nonce);
		if (request.state) addState(parameters, request.state);
		if (request.embeddedClientId) addBrokerParameters(parameters, authOptions.clientId, authOptions.redirectUri);
		addClaims(parameters, request.correlationId, request.claims, authOptions.clientCapabilities, request.skipBrokerClaims);
		if (authOptions.instanceAware && (!request.extraQueryParameters || !Object.keys(request.extraQueryParameters).includes(INSTANCE_AWARE))) addInstanceAware(parameters);
		return parameters;
	}
	/**
	* Returns authorize endpoint with given request parameters in the query string
	* @param authority
	* @param requestParameters
	* @returns
	* @internal
	*/
	function getAuthorizeUrl(authority, requestParameters) {
		const queryString = mapToQueryString(requestParameters);
		return UrlString.appendQueryString(authority.authorizationEndpoint, queryString);
	}
	/**
	* Helper to get sid from account. Returns null if idTokenClaims are not present or sid is not present.
	* @param account
	*/
	function extractAccountSid(account) {
		return account.idTokenClaims?.sid || null;
	}
	function extractLoginHint(account) {
		return account.loginHint || account.idTokenClaims?.login_hint || null;
	}
	/*! @azure/msal-common v16.14.3 2026-10-21 */
	const DEFAULT_REFRESH_TOKEN_EXPIRATION_OFFSET_SECONDS = 300;
	/**
	* OAuth2.0 refresh token client
	* @internal
	*/
	var RefreshTokenClient = class {
		constructor(configuration, performanceClient) {
			this.config = buildClientConfiguration(configuration);
			this.logger = new Logger(this.config.loggerOptions, name$1, version$1);
			this.cryptoUtils = this.config.cryptoInterface;
			this.cacheManager = this.config.storageInterface;
			this.networkClient = this.config.networkInterface;
			this.serverTelemetryManager = this.config.serverTelemetryManager;
			this.authority = this.config.authOptions.authority;
			this.performanceClient = performanceClient;
		}
		async acquireToken(request, apiId) {
			const reqTimestamp = nowSeconds();
			const response = await invokeAsync(this.executeTokenRequest.bind(this), RefreshTokenClientExecuteTokenRequest, this.logger, this.performanceClient, request.correlationId)(request, this.authority);
			const requestId = response.headers?.[HeaderNames.X_MS_REQUEST_ID];
			const responseHandler = new ResponseHandler(this.config.authOptions.clientId, this.cacheManager, this.cryptoUtils, this.logger, this.performanceClient, this.config.serializableCache, this.config.persistencePlugin, this.config.tokenBindingKeyManager);
			responseHandler.validateTokenResponse(response.body, request.correlationId);
			return invokeAsync(responseHandler.handleServerTokenResponse.bind(responseHandler), HandleServerTokenResponse, this.logger, this.performanceClient, request.correlationId)(response.body, this.authority, reqTimestamp, request, apiId, void 0, void 0, true, request.forceCache, requestId);
		}
		/**
		* Gets cached refresh token and attaches to request, then calls acquireToken API
		* @param request
		*/
		async acquireTokenByRefreshToken(request, apiId) {
			if (!request) throw createClientConfigurationError(tokenRequestEmpty, "");
			if (!request.account) throw createClientAuthError(noAccountInSilentRequest, request.correlationId);
			if (this.cacheManager.isAppMetadataFOCI(request.account.environment, request.correlationId)) try {
				return await invokeAsync(this.acquireTokenWithCachedRefreshToken.bind(this), RefreshTokenClientAcquireTokenWithCachedRefreshToken, this.logger, this.performanceClient, request.correlationId)(request, true, apiId);
			} catch (e) {
				const noFamilyRTInCache = e instanceof InteractionRequiredAuthError && e.errorCode === noTokensFound;
				const clientMismatchErrorWithFamilyRT = e instanceof ServerError && e.errorCode === INVALID_GRANT_ERROR && e.subError === CLIENT_MISMATCH_ERROR;
				if (noFamilyRTInCache || clientMismatchErrorWithFamilyRT) return invokeAsync(this.acquireTokenWithCachedRefreshToken.bind(this), RefreshTokenClientAcquireTokenWithCachedRefreshToken, this.logger, this.performanceClient, request.correlationId)(request, false, apiId);
				else throw e;
			}
			return invokeAsync(this.acquireTokenWithCachedRefreshToken.bind(this), RefreshTokenClientAcquireTokenWithCachedRefreshToken, this.logger, this.performanceClient, request.correlationId)(request, false, apiId);
		}
		/**
		* makes a network call to acquire tokens by exchanging RefreshToken available in userCache; throws if refresh token is not cached
		* @param request
		*/
		async acquireTokenWithCachedRefreshToken(request, foci, apiId) {
			const refreshToken = invoke(this.cacheManager.getRefreshToken.bind(this.cacheManager), CacheManagerGetRefreshToken, this.logger, this.performanceClient, request.correlationId)(request.account, foci, request.correlationId, void 0);
			if (!refreshToken) throw createInteractionRequiredAuthError(noTokensFound, request.correlationId);
			if (refreshToken.expiresOn) {
				const offset = request.refreshTokenExpirationOffsetSeconds || DEFAULT_REFRESH_TOKEN_EXPIRATION_OFFSET_SECONDS;
				this.performanceClient?.addFields({
					cacheRtExpiresOnSeconds: Number(refreshToken.expiresOn),
					rtOffsetSeconds: offset
				}, request.correlationId);
				if (isTokenExpired(refreshToken.expiresOn, offset)) throw createInteractionRequiredAuthError(refreshTokenExpired, request.correlationId);
			}
			const refreshTokenRequest = {
				...request,
				refreshToken: refreshToken.secret,
				authenticationScheme: request.authenticationScheme || AuthenticationScheme.BEARER,
				ccsCredential: {
					credential: request.account.homeAccountId,
					type: CcsCredentialType.HOME_ACCOUNT_ID
				}
			};
			if (refreshTokenRequest.authenticationScheme === AuthenticationScheme.DPOP && !refreshTokenRequest.dpopJkt) refreshTokenRequest.dpopJkt = await new DpopProofGenerator(this.cryptoUtils, this.config.tokenBindingKeyManager).generateJkt(request.correlationId);
			try {
				return await invokeAsync(this.acquireToken.bind(this), RefreshTokenClientAcquireToken, this.logger, this.performanceClient, request.correlationId)(refreshTokenRequest, apiId);
			} catch (e) {
				if (e instanceof InteractionRequiredAuthError) {
					if (e.subError === badToken) {
						this.logger.verbose("acquireTokenWithRefreshToken: bad refresh token, removing from cache", request.correlationId);
						const badRefreshTokenKey = this.cacheManager.generateCredentialKey(refreshToken);
						this.cacheManager.removeRefreshToken(badRefreshTokenKey, request.correlationId);
					}
				}
				throw e;
			}
		}
		/**
		* Constructs the network message and makes a NW call to the underlying secure token service
		* @param request
		* @param authority
		*/
		async executeTokenRequest(request, authority) {
			const queryParametersString = createTokenQueryParameters(request, this.config.authOptions.clientId, this.config.authOptions.redirectUri, this.performanceClient);
			const endpoint = UrlString.appendQueryString(authority.tokenEndpoint, queryParametersString);
			const requestBody = await invokeAsync(this.createTokenRequestBody.bind(this), RefreshTokenClientCreateTokenRequestBody, this.logger, this.performanceClient, request.correlationId)(request);
			const headers = createTokenRequestHeaders(this.logger, this.config.systemOptions.preventCorsPreflight, request.ccsCredential);
			await addDpopTokenProofHeader(headers, request, endpoint, this.cryptoUtils, this.config.tokenBindingKeyManager);
			const thumbprint = getRequestThumbprint(this.config.authOptions.clientId, request);
			return invokeAsync(executePostToTokenEndpoint, RefreshTokenClientExecutePostToTokenEndpoint, this.logger, this.performanceClient, request.correlationId)(endpoint, requestBody, headers, thumbprint, request.correlationId, this.cacheManager, this.networkClient, this.logger, this.performanceClient, this.serverTelemetryManager);
		}
		/**
		* Helper function to create the token request body
		* @param request
		*/
		async createTokenRequestBody(request) {
			const parameters = /* @__PURE__ */ new Map();
			addClientId(parameters, request.embeddedClientId || request.extraParameters?.[CLIENT_ID] || this.config.authOptions.clientId);
			if (request.redirectUri) addRedirectUri(parameters, request.redirectUri);
			addScopes(parameters, request.scopes, request.correlationId, true, this.config.authOptions.authority.options.OIDCOptions?.defaultScopes);
			addResource(parameters, request.resource);
			addGrantType(parameters, GrantType.REFRESH_TOKEN_GRANT);
			addClientInfo(parameters);
			addLibraryInfo(parameters, this.config.libraryInfo);
			addApplicationTelemetry(parameters, this.config.telemetry.application);
			addThrottling(parameters);
			if (this.serverTelemetryManager && !isOidcProtocolMode(this.config)) addServerTelemetry(parameters, this.serverTelemetryManager);
			addRefreshToken(parameters, request.refreshToken);
			if (request.attributeTokens) addAttributeTokens(parameters, request.attributeTokens);
			this.performanceClient?.addFields({ hasAttributeTokens: !!request.attributeTokens?.length }, request.correlationId);
			if (this.config.clientCredentials.clientSecret) addClientSecret(parameters, this.config.clientCredentials.clientSecret);
			if (this.config.clientCredentials.clientAssertion) {
				const clientAssertion = this.config.clientCredentials.clientAssertion;
				addClientAssertion(parameters, await getClientAssertion(clientAssertion.assertion, this.config.authOptions.clientId, request.resourceRequestUri));
				addClientAssertionType(parameters, clientAssertion.assertionType);
			}
			if (request.authenticationScheme === AuthenticationScheme.POP) {
				const popTokenGenerator = new PopTokenGenerator(this.cryptoUtils, this.config.tokenBindingKeyManager, this.performanceClient);
				let reqCnfData;
				if (!request.popKid) reqCnfData = (await invokeAsync(popTokenGenerator.generateCnf.bind(popTokenGenerator), PopTokenGenerateCnf, this.logger, this.performanceClient, request.correlationId)(request, this.logger)).reqCnfString;
				else reqCnfData = this.cryptoUtils.encodeKid(request.popKid);
				addPopToken(parameters, reqCnfData);
			} else if (request.authenticationScheme === AuthenticationScheme.SSH) if (request.sshJwk) addSshJwk(parameters, request.sshJwk);
			else throw createClientConfigurationError(missingSshJwk, request.correlationId);
			if (this.config.systemOptions.preventCorsPreflight && request.ccsCredential) switch (request.ccsCredential.type) {
				case CcsCredentialType.HOME_ACCOUNT_ID:
					try {
						addCcsOid(parameters, buildClientInfoFromHomeAccountId(request.ccsCredential.credential));
					} catch (e) {
						this.logger.verbose(`Could not parse home account ID for CCS Header: '${e}'`, request.correlationId);
					}
					break;
				case CcsCredentialType.UPN:
					addCcsUpn(parameters, request.ccsCredential.credential);
					break;
			}
			if (request.embeddedClientId) addBrokerParameters(parameters, this.config.authOptions.clientId, this.config.authOptions.redirectUri);
			if (request.extraParameters) addExtraParameters(parameters, { ...request.extraParameters });
			instrumentBrokerParams(parameters, request.correlationId, this.performanceClient);
			addClaims(parameters, request.correlationId, request.claims, this.config.authOptions.clientCapabilities, request.skipBrokerClaims);
			return mapToQueryString(parameters);
		}
	};
	/*! @azure/msal-common v16.14.3 2026-10-21 */
	const skuGroupSeparator = ",";
	const skuValueSeparator = "|";
	function makeExtraSkuString(params) {
		const { skus, libraryName, libraryVersion, extensionName, extensionVersion } = params;
		const skuMap = new Map([[0, [libraryName, libraryVersion]], [2, [extensionName, extensionVersion]]]);
		let skuArr = [];
		if (skus?.length) {
			skuArr = skus.split(skuGroupSeparator);
			if (skuArr.length < 4) return skus;
		} else skuArr = Array.from({ length: 4 }, () => skuValueSeparator);
		skuMap.forEach((value, key) => {
			if (value.length === 2 && value[0]?.length && value[1]?.length) setSku({
				skuArr,
				index: key,
				skuName: value[0],
				skuVersion: value[1]
			});
		});
		return skuArr.join(skuGroupSeparator);
	}
	function setSku(params) {
		const { skuArr, index, skuName, skuVersion } = params;
		if (index >= skuArr.length) return;
		skuArr[index] = [skuName, skuVersion].join(skuValueSeparator);
	}
	/** @internal */
	var ServerTelemetryManager = class ServerTelemetryManager {
		constructor(telemetryRequest, cacheManager) {
			this.cacheOutcome = CacheOutcome.NOT_APPLICABLE;
			this.cacheManager = cacheManager;
			this.apiId = telemetryRequest.apiId;
			this.correlationId = telemetryRequest.correlationId;
			this.wrapperSKU = telemetryRequest.wrapperSKU || "";
			this.wrapperVer = telemetryRequest.wrapperVer || "";
			this.telemetryCacheKey = SERVER_TELEM_CACHE_KEY + CACHE_KEY_SEPARATOR + telemetryRequest.clientId;
		}
		/**
		* API to add MSER Telemetry to request
		*/
		generateCurrentRequestHeaderValue() {
			const request = `${this.apiId}${SERVER_TELEM_VALUE_SEPARATOR}${this.cacheOutcome}`;
			const platformFieldsArr = [this.wrapperSKU, this.wrapperVer];
			const nativeBrokerErrorCode = this.getNativeBrokerErrorCode();
			if (nativeBrokerErrorCode?.length) platformFieldsArr.push(`broker_error=${nativeBrokerErrorCode}`);
			const platformFields = platformFieldsArr.join(SERVER_TELEM_VALUE_SEPARATOR);
			return [
				SERVER_TELEM_SCHEMA_VERSION,
				[request, this.getRegionDiscoveryFields()].join(SERVER_TELEM_VALUE_SEPARATOR),
				platformFields
			].join(SERVER_TELEM_CATEGORY_SEPARATOR);
		}
		/**
		* API to add MSER Telemetry for the last failed request
		*/
		generateLastRequestHeaderValue() {
			const lastRequests = this.getLastRequests();
			const maxErrors = ServerTelemetryManager.maxErrorsToSend(lastRequests);
			const failedRequests = lastRequests.failedRequests.slice(0, 2 * maxErrors).join(SERVER_TELEM_VALUE_SEPARATOR);
			const errors = lastRequests.errors.slice(0, maxErrors).join(SERVER_TELEM_VALUE_SEPARATOR);
			const errorCount = lastRequests.errors.length;
			const platformFields = [errorCount, maxErrors < errorCount ? SERVER_TELEM_OVERFLOW_TRUE : SERVER_TELEM_OVERFLOW_FALSE].join(SERVER_TELEM_VALUE_SEPARATOR);
			return [
				SERVER_TELEM_SCHEMA_VERSION,
				lastRequests.cacheHits,
				failedRequests,
				errors,
				platformFields
			].join(SERVER_TELEM_CATEGORY_SEPARATOR);
		}
		/**
		* API to cache token failures for MSER data capture
		* @param error
		*/
		cacheFailedRequest(error) {
			try {
				const lastRequests = this.getLastRequests();
				if (lastRequests.errors.length >= SERVER_TELEM_MAX_CACHED_ERRORS) {
					lastRequests.failedRequests.shift();
					lastRequests.failedRequests.shift();
					lastRequests.errors.shift();
				}
				lastRequests.failedRequests.push(this.apiId, this.correlationId);
				if (error instanceof Error && !!error && error.toString()) if (error instanceof AuthError) if (error.subError) lastRequests.errors.push(error.subError);
				else if (error.errorCode) lastRequests.errors.push(error.errorCode);
				else lastRequests.errors.push(error.toString());
				else lastRequests.errors.push(error.toString());
				else lastRequests.errors.push(SERVER_TELEM_UNKNOWN_ERROR);
				this.cacheManager.setServerTelemetry(this.telemetryCacheKey, lastRequests, this.correlationId);
			} catch {}
		}
		/**
		* Update server telemetry cache entry by incrementing cache hit counter
		*/
		incrementCacheHits() {
			const lastRequests = this.getLastRequests();
			lastRequests.cacheHits += 1;
			this.cacheManager.setServerTelemetry(this.telemetryCacheKey, lastRequests, this.correlationId);
			return lastRequests.cacheHits;
		}
		/**
		* Get the server telemetry entity from cache or initialize a new one
		*/
		getLastRequests() {
			return this.cacheManager.getServerTelemetry(this.telemetryCacheKey, this.correlationId) || {
				failedRequests: [],
				errors: [],
				cacheHits: 0
			};
		}
		/**
		* Remove server telemetry cache entry
		*/
		clearTelemetryCache() {
			const lastRequests = this.getLastRequests();
			const numErrorsFlushed = ServerTelemetryManager.maxErrorsToSend(lastRequests);
			if (numErrorsFlushed === lastRequests.errors.length) this.cacheManager.removeItem(this.telemetryCacheKey, this.correlationId);
			else {
				const serverTelemEntity = {
					failedRequests: lastRequests.failedRequests.slice(numErrorsFlushed * 2),
					errors: lastRequests.errors.slice(numErrorsFlushed),
					cacheHits: 0
				};
				this.cacheManager.setServerTelemetry(this.telemetryCacheKey, serverTelemEntity, this.correlationId);
			}
		}
		/**
		* Returns the maximum number of errors that can be flushed to the server in the next network request
		* @param serverTelemetryEntity
		*/
		static maxErrorsToSend(serverTelemetryEntity) {
			let i;
			let maxErrors = 0;
			let dataSize = 0;
			const errorCount = serverTelemetryEntity.errors.length;
			for (i = 0; i < errorCount; i++) {
				const apiId = serverTelemetryEntity.failedRequests[2 * i] || "";
				const correlationId = serverTelemetryEntity.failedRequests[2 * i + 1] || "";
				const errorCode = serverTelemetryEntity.errors[i] || "";
				dataSize += apiId.toString().length + correlationId.toString().length + errorCode.length + 3;
				if (dataSize < SERVER_TELEM_MAX_LAST_HEADER_BYTES) maxErrors += 1;
				else break;
			}
			return maxErrors;
		}
		/**
		* Get the region discovery fields
		*
		* @returns string
		*/
		getRegionDiscoveryFields() {
			const regionDiscoveryFields = [];
			regionDiscoveryFields.push(this.regionUsed || "");
			regionDiscoveryFields.push(this.regionSource || "");
			regionDiscoveryFields.push(this.regionOutcome || "");
			return regionDiscoveryFields.join(",");
		}
		/**
		* Update the region discovery metadata
		*
		* @param regionDiscoveryMetadata
		* @returns void
		*/
		updateRegionDiscoveryMetadata(regionDiscoveryMetadata) {
			this.regionUsed = regionDiscoveryMetadata.region_used;
			this.regionSource = regionDiscoveryMetadata.region_source;
			this.regionOutcome = regionDiscoveryMetadata.region_outcome;
		}
		/**
		* Set cache outcome
		*/
		setCacheOutcome(cacheOutcome) {
			this.cacheOutcome = cacheOutcome;
		}
		setNativeBrokerErrorCode(errorCode) {
			const lastRequests = this.getLastRequests();
			lastRequests.nativeBrokerErrorCode = errorCode;
			this.cacheManager.setServerTelemetry(this.telemetryCacheKey, lastRequests, this.correlationId);
		}
		getNativeBrokerErrorCode() {
			return this.getLastRequests().nativeBrokerErrorCode;
		}
		clearNativeBrokerErrorCode() {
			const lastRequests = this.getLastRequests();
			delete lastRequests.nativeBrokerErrorCode;
			this.cacheManager.setServerTelemetry(this.telemetryCacheKey, lastRequests, this.correlationId);
		}
		static makeExtraSkuString(params) {
			return makeExtraSkuString(params);
		}
	};
	/*! @azure/msal-common v16.14.3 2026-10-21 */
	/** @internal */
	var SilentFlowClient = class {
		constructor(configuration, performanceClient) {
			this.config = buildClientConfiguration(configuration);
			this.logger = new Logger(this.config.loggerOptions, name$1, version$1);
			this.cryptoUtils = this.config.cryptoInterface;
			this.cacheManager = this.config.storageInterface;
			this.networkClient = this.config.networkInterface;
			this.serverTelemetryManager = this.config.serverTelemetryManager;
			this.authority = this.config.authOptions.authority;
			this.performanceClient = performanceClient;
		}
		/**
		* Retrieves token from cache or throws an error if it must be refreshed.
		* @param request
		*/
		async acquireCachedToken(request) {
			let lastCacheOutcome = CacheOutcome.NOT_APPLICABLE;
			if (request.forceRefresh || !StringUtils.isEmptyObj(request.claims)) {
				this.setCacheOutcome(CacheOutcome.FORCE_REFRESH_OR_CLAIMS, request.correlationId);
				throw createClientAuthError(tokenRefreshRequired, request.correlationId);
			}
			if (!request.account) throw createClientAuthError(noAccountInSilentRequest, request.correlationId);
			const requestTenantId = request.account.tenantId || getTenantFromAuthorityString(request.authority, request.correlationId);
			const tokenKeys = this.cacheManager.getTokenKeys();
			const cachedAccessToken = this.cacheManager.getAccessToken(request.account, request, tokenKeys, requestTenantId);
			if (!cachedAccessToken) {
				this.setCacheOutcome(CacheOutcome.NO_CACHED_ACCESS_TOKEN, request.correlationId);
				throw createClientAuthError(tokenRefreshRequired, request.correlationId);
			} else if (wasClockTurnedBack(cachedAccessToken.cachedAt) || isTokenExpired(cachedAccessToken.expiresOn, this.config.systemOptions.tokenRenewalOffsetSeconds)) {
				this.setCacheOutcome(CacheOutcome.CACHED_ACCESS_TOKEN_EXPIRED, request.correlationId);
				throw createClientAuthError(tokenRefreshRequired, request.correlationId);
			} else if (request.resource) {
				if (cachedAccessToken.resource !== request.resource) {
					this.setCacheOutcome(CacheOutcome.NO_CACHED_ACCESS_TOKEN, request.correlationId);
					throw createClientAuthError(tokenRefreshRequired, request.correlationId);
				}
			} else if (cachedAccessToken.refreshOn && isTokenExpired(cachedAccessToken.refreshOn, 0)) lastCacheOutcome = CacheOutcome.PROACTIVELY_REFRESHED;
			if (cachedAccessToken.tokenType?.toLowerCase() === AuthenticationScheme.DPOP.toLowerCase()) {
				if (!cachedAccessToken.keyId) {
					this.logger.info("SilentFlowClient:acquireCachedToken - Cached DPoP access token is missing keyId; refresh required", request.correlationId);
					this.setCacheOutcome(CacheOutcome.NO_CACHED_ACCESS_TOKEN, request.correlationId);
					throw createClientAuthError(tokenRefreshRequired, request.correlationId);
				}
				try {
					await this.config.tokenBindingKeyManager.getTokenBindingPublicKeyJwk(cachedAccessToken.keyId, request.correlationId);
				} catch {
					this.logger.info("SilentFlowClient:acquireCachedToken - Local DPoP key was not found for cached access token; refresh required", request.correlationId);
					this.setCacheOutcome(CacheOutcome.NO_CACHED_ACCESS_TOKEN, request.correlationId);
					throw createClientAuthError(tokenRefreshRequired, request.correlationId);
				}
			}
			const environment = request.authority || this.authority.getPreferredCache();
			const cacheRecord = {
				account: this.cacheManager.getAccount(this.cacheManager.generateAccountKey(request.account), request.correlationId),
				accessToken: cachedAccessToken,
				idToken: this.cacheManager.getIdToken(request.account, request.correlationId, tokenKeys, requestTenantId),
				refreshToken: null,
				appMetadata: this.cacheManager.readAppMetadataFromCache(environment, request.correlationId)
			};
			this.setCacheOutcome(lastCacheOutcome, request.correlationId);
			if (this.config.serverTelemetryManager) this.config.serverTelemetryManager.incrementCacheHits();
			return [await invokeAsync(this.generateResultFromCacheRecord.bind(this), SilentFlowClientGenerateResultFromCacheRecord, this.logger, this.performanceClient, request.correlationId)(cacheRecord, request), lastCacheOutcome];
		}
		setCacheOutcome(cacheOutcome, correlationId) {
			this.serverTelemetryManager?.setCacheOutcome(cacheOutcome);
			this.performanceClient?.addFields({ cacheOutcome }, correlationId);
			if (cacheOutcome !== CacheOutcome.NOT_APPLICABLE) this.logger.info(`Token refresh is required due to cache outcome: '${cacheOutcome}'`, correlationId);
		}
		/**
		* Helper function to build response object from the CacheRecord
		* @param cacheRecord
		*/
		async generateResultFromCacheRecord(cacheRecord, request) {
			let idTokenClaims;
			if (cacheRecord.idToken) idTokenClaims = extractTokenClaims(cacheRecord.idToken.secret, this.config.cryptoInterface.base64Decode, request.correlationId);
			return ResponseHandler.generateAuthenticationResult(this.cryptoUtils, this.authority, cacheRecord, true, request, this.performanceClient, {
				idTokenClaims,
				tokenBindingKeyManager: this.config.tokenBindingKeyManager
			});
		}
	};
	/*! @azure/msal-common v16.14.3 2026-10-21 */
	/**
	* Helper to enforce resource parameter presence in token requests when isMcp is set in the configuration.
	* If resource parameter is set in both the request and in extraQueryParameters or extraParameters, an error will be thrown.
	* This is used for MCP flows.
	* @param isMcp - Flag indicating if application is an MCP app, from configuration
	* @param request - Auth request
	*/
	function enforceResourceParameter(isMcp, request) {
		if (!isMcp) return;
		if (request.resource && (containsResourceParam(request.extraParameters) || containsResourceParam(request.extraQueryParameters))) throw createClientAuthError(misplacedResourceParam, request.correlationId || "");
		if (!request.resource) throw createClientAuthError(resourceParameterRequired, request.correlationId || "");
	}
	function containsResourceParam(params) {
		if (!params) return false;
		return Object.prototype.hasOwnProperty.call(params, "resource");
	}
	/**
	* This class deserializes cache entities read from the file into in-memory object types defined internally
	* @internal
	*/
	var Deserializer = class {
		/**
		* Parse the JSON blob in memory and deserialize the content
		* @param cachedJson - JSON blob cache
		*/
		static deserializeJSONBlob(jsonFile) {
			return !jsonFile ? {} : JSON.parse(jsonFile);
		}
		/**
		* Deserializes accounts to AccountEntity objects
		* @param accounts - accounts of type SerializedAccountEntity
		*/
		static deserializeAccounts(accounts) {
			const accountObjects = {};
			if (accounts) Object.keys(accounts).map(function(key) {
				const serializedAcc = accounts[key];
				const mappedAcc = {
					homeAccountId: serializedAcc.home_account_id,
					environment: serializedAcc.environment,
					realm: serializedAcc.realm,
					localAccountId: serializedAcc.local_account_id,
					username: serializedAcc.username,
					authorityType: serializedAcc.authority_type,
					name: serializedAcc.name,
					clientInfo: serializedAcc.client_info,
					lastModificationTime: serializedAcc.last_modification_time,
					lastModificationApp: serializedAcc.last_modification_app,
					tenantProfiles: serializedAcc.tenantProfiles?.map((serializedTenantProfile) => {
						return JSON.parse(serializedTenantProfile);
					}),
					lastUpdatedAt: Date.now().toString()
				};
				const account = {};
				CacheManager.toObject(account, mappedAcc);
				accountObjects[key] = account;
			});
			return accountObjects;
		}
		/**
		* Deserializes id tokens to IdTokenEntity objects
		* @param idTokens - credentials of type SerializedIdTokenEntity
		*/
		static deserializeIdTokens(idTokens) {
			const idObjects = {};
			if (idTokens) Object.keys(idTokens).map(function(key) {
				const serializedIdT = idTokens[key];
				idObjects[key] = {
					homeAccountId: serializedIdT.home_account_id,
					environment: serializedIdT.environment,
					credentialType: serializedIdT.credential_type,
					clientId: serializedIdT.client_id,
					secret: serializedIdT.secret,
					realm: serializedIdT.realm,
					lastUpdatedAt: Date.now().toString()
				};
			});
			return idObjects;
		}
		/**
		* Deserializes access tokens to AccessTokenEntity objects
		* @param accessTokens - access tokens of type SerializedAccessTokenEntity
		*/
		static deserializeAccessTokens(accessTokens) {
			const atObjects = {};
			if (accessTokens) Object.keys(accessTokens).map(function(key) {
				const serializedAT = accessTokens[key];
				atObjects[key] = {
					homeAccountId: serializedAT.home_account_id,
					environment: serializedAT.environment,
					credentialType: serializedAT.credential_type,
					clientId: serializedAT.client_id,
					secret: serializedAT.secret,
					realm: serializedAT.realm,
					target: serializedAT.target,
					cachedAt: serializedAT.cached_at,
					expiresOn: serializedAT.expires_on,
					extendedExpiresOn: serializedAT.extended_expires_on,
					refreshOn: serializedAT.refresh_on,
					keyId: serializedAT.key_id,
					tokenType: serializedAT.token_type,
					userAssertionHash: serializedAT.userAssertionHash,
					resource: serializedAT.resource,
					additionalCacheKeyComponents: serializedAT.additionalCacheKeyComponents,
					lastUpdatedAt: Date.now().toString()
				};
			});
			return atObjects;
		}
		/**
		* Deserializes refresh tokens to RefreshTokenEntity objects
		* @param refreshTokens - refresh tokens of type SerializedRefreshTokenEntity
		*/
		static deserializeRefreshTokens(refreshTokens) {
			const rtObjects = {};
			if (refreshTokens) Object.keys(refreshTokens).map(function(key) {
				const serializedRT = refreshTokens[key];
				rtObjects[key] = {
					homeAccountId: serializedRT.home_account_id,
					environment: serializedRT.environment,
					credentialType: serializedRT.credential_type,
					clientId: serializedRT.client_id,
					secret: serializedRT.secret,
					familyId: serializedRT.family_id,
					target: serializedRT.target,
					realm: serializedRT.realm,
					lastUpdatedAt: Date.now().toString()
				};
			});
			return rtObjects;
		}
		/**
		* Deserializes appMetadata to AppMetaData objects
		* @param appMetadata - app metadata of type SerializedAppMetadataEntity
		*/
		static deserializeAppMetadata(appMetadata) {
			const appMetadataObjects = {};
			if (appMetadata) Object.keys(appMetadata).map(function(key) {
				const serializedAmdt = appMetadata[key];
				appMetadataObjects[key] = {
					clientId: serializedAmdt.client_id,
					environment: serializedAmdt.environment,
					familyId: serializedAmdt.family_id
				};
			});
			return appMetadataObjects;
		}
		/**
		* Deserialize an inMemory Cache
		* @param jsonCache - JSON blob cache
		*/
		static deserializeAllCache(jsonCache) {
			return {
				accounts: jsonCache.Account ? this.deserializeAccounts(jsonCache.Account) : {},
				idTokens: jsonCache.IdToken ? this.deserializeIdTokens(jsonCache.IdToken) : {},
				accessTokens: jsonCache.AccessToken ? this.deserializeAccessTokens(jsonCache.AccessToken) : {},
				refreshTokens: jsonCache.RefreshToken ? this.deserializeRefreshTokens(jsonCache.RefreshToken) : {},
				appMetadata: jsonCache.AppMetadata ? this.deserializeAppMetadata(jsonCache.AppMetadata) : {}
			};
		}
	};
	/**
	* Warning: This set of exports is purely intended to be used by other MSAL libraries, and should be considered potentially unstable. We strongly discourage using them directly, you do so at your own risk.
	* Breaking changes to these APIs will be shipped under a minor version, instead of a major version.
	*/
	var internals = /* @__PURE__ */ Object.freeze({
		__proto__: null,
		Deserializer,
		Serializer
	});
	const DEFAULT_MANAGED_IDENTITY_ID = "system_assigned_managed_identity";
	const DEFAULT_AUTHORITY_FOR_MANAGED_IDENTITY = `https://login.microsoftonline.com/managed_identity/`;
	/**
	* Managed Identity Headers - used in network requests
	*/
	const ManagedIdentityHeaders = {
		AUTHORIZATION_HEADER_NAME: "Authorization",
		METADATA_HEADER_NAME: "Metadata",
		APP_SERVICE_SECRET_HEADER_NAME: "X-IDENTITY-HEADER",
		ML_AND_SF_SECRET_HEADER_NAME: "secret",
		CLIENT_SKU: X_CLIENT_SKU,
		CLIENT_VER: X_CLIENT_VER,
		CLIENT_REQUEST_ID: "x-ms-client-request-id"
	};
	/**
	* Managed Identity Query Parameters - used in network requests
	*/
	const ManagedIdentityQueryParameters = {
		API_VERSION: "api-version",
		RESOURCE: "resource",
		SHA256_TOKEN_TO_REFRESH: "token_sha256_to_refresh",
		XMS_CC: "xms_cc"
	};
	/**
	* Managed Identity Environment Variable Names
	*/
	const ManagedIdentityEnvironmentVariableNames = {
		AZURE_POD_IDENTITY_AUTHORITY_HOST: "AZURE_POD_IDENTITY_AUTHORITY_HOST",
		DEFAULT_IDENTITY_CLIENT_ID: "DEFAULT_IDENTITY_CLIENT_ID",
		IDENTITY_ENDPOINT: "IDENTITY_ENDPOINT",
		IDENTITY_HEADER: "IDENTITY_HEADER",
		IDENTITY_SERVER_THUMBPRINT: "IDENTITY_SERVER_THUMBPRINT",
		IMDS_ENDPOINT: "IMDS_ENDPOINT",
		MSI_ENDPOINT: "MSI_ENDPOINT",
		MSI_SECRET: "MSI_SECRET"
	};
	/**
	* Managed Identity Source Names
	* @public
	*/
	const ManagedIdentitySourceNames = {
		APP_SERVICE: "AppService",
		AZURE_ARC: "AzureArc",
		CLOUD_SHELL: "CloudShell",
		DEFAULT_TO_IMDS: "DefaultToImds",
		IMDS: "Imds",
		MACHINE_LEARNING: "MachineLearning",
		SERVICE_FABRIC: "ServiceFabric"
	};
	/**
	* Managed Identity Ids
	*/
	const ManagedIdentityIdType = {
		SYSTEM_ASSIGNED: "system-assigned",
		USER_ASSIGNED_CLIENT_ID: "user-assigned-client-id",
		USER_ASSIGNED_RESOURCE_ID: "user-assigned-resource-id",
		USER_ASSIGNED_OBJECT_ID: "user-assigned-object-id"
	};
	/**
	* http methods
	*/
	const HttpMethod = {
		GET: "GET",
		POST: "POST"
	};
	/**
	* Constants used for region discovery
	*/
	const REGION_ENVIRONMENT_VARIABLE = "REGION_NAME";
	const MSAL_FORCE_REGION = "MSAL_FORCE_REGION";
	/**
	* Constant used for PKCE
	*/
	const RANDOM_OCTET_SIZE = 32;
	/**
	* Constants used in PKCE
	*/
	const Hash = { SHA256: "sha256" };
	/**
	* Constants for encoding schemes
	*/
	const CharSet = { CV_CHARSET: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~" };
	/**
	* Cache Constants
	*/
	const CACHE = { KEY_SEPARATOR: "-" };
	/**
	* Constants
	*/
	const Constants = {
		MSAL_SKU: "msal.js.node",
		JWT_BEARER_ASSERTION_TYPE: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
		HTTP_PROTOCOL: "http://",
		LOCALHOST: "localhost"
	};
	/**
	* API Codes for Telemetry purposes.
	* Before adding a new code you must claim it in the MSAL Telemetry tracker as these number spaces are shared across all MSALs
	* 0-99 Silent Flow
	* 600-699 Device Code Flow
	* 800-899 Auth Code Flow
	*/
	const ApiId = {
		acquireTokenSilent: 62,
		acquireTokenByUsernamePassword: 371,
		acquireTokenByDeviceCode: 671,
		acquireTokenByClientCredential: 771,
		acquireTokenByOBO: 772,
		acquireTokenWithManagedIdentity: 773,
		acquireTokenByUserFederatedIdentityCredential: 774,
		acquireTokenByCode: 871,
		acquireTokenByRefreshToken: 872
	};
	/**
	* JWT  constants
	*/
	const JwtConstants = {
		RSA_256: "RS256",
		PSS_256: "PS256",
		X5T_256: "x5t#S256",
		X5T: "x5t",
		X5C: "x5c",
		AUDIENCE: "aud",
		EXPIRATION_TIME: "exp",
		ISSUER: "iss",
		SUBJECT: "sub",
		NOT_BEFORE: "nbf",
		JWT_ID: "jti"
	};
	const LOOPBACK_SERVER_CONSTANTS = {
		INTERVAL_MS: 100,
		TIMEOUT_MS: 5e3
	};
	const AZURE_ARC_SECRET_FILE_MAX_SIZE_BYTES = 4096;
	/**
	* HTTP client implementation using Node.js native fetch API.
	*
	* This class provides a clean interface for making HTTP requests using the modern
	* fetch API available in Node.js 18+. It replaces the previous implementation that
	* relied on custom proxy handling and the legacy http/https modules.
	*/
	var HttpClient = class {
		/**
		* Sends an HTTP GET request to the specified URL.
		*
		* This method handles GET requests with optional timeout support. The timeout
		* is implemented using AbortController, which provides a clean way to cancel
		* fetch requests that take too long to complete.
		*
		* @param url - The target URL for the GET request
		* @param options - Optional request configuration including headers
		* @param timeout - Optional timeout in milliseconds. If specified, the request
		*                  will be aborted if it doesn't complete within this time
		* @returns Promise that resolves to a NetworkResponse containing headers, body, and status
		* @throws {AuthError} When the request times out or response parsing fails
		* @throws {NetworkError} When the network request fails
		*/
		async sendGetRequestAsync(url, options, timeout) {
			return this.sendRequest(url, HttpMethod.GET, options, timeout);
		}
		/**
		* Sends an HTTP POST request to the specified URL.
		*
		* This method handles POST requests with request body support. Currently,
		* timeout functionality is not exposed for POST requests, but the underlying
		* implementation supports it through the shared sendRequest method.
		*
		* @param url - The target URL for the POST request
		* @param options - Optional request configuration including headers and body
		* @returns Promise that resolves to a NetworkResponse containing headers, body, and status
		* @throws {AuthError} When the request times out or response parsing fails
		* @throws {NetworkError} When the network request fails
		*/
		async sendPostRequestAsync(url, options) {
			return this.sendRequest(url, HttpMethod.POST, options);
		}
		/**
		* Core HTTP request implementation using native fetch API.
		*
		* This method handles GET and POST HTTP requests with comprehensive
		* timeout support and error handling. The timeout mechanism works as follows:
		*
		* 1. An AbortController is created for each request
		* 2. If a timeout is specified, setTimeout is used to call abort() after the delay
		* 3. The abort signal is passed to fetch, which will reject the promise if aborted
		* 4. Cleanup occurs in both success and error cases to prevent timer leaks
		*
		* Error handling priority:
		* 1. Timeout errors (AbortError) are converted to "Request timeout" messages
		* 2. Network/connection errors are wrapped with "Network request failed" prefix
		* 3. JSON parsing errors are wrapped with "Failed to parse response" prefix
		*
		* @param url - The target URL for the request
		* @param method - HTTP method (GET or POST)
		* @param options - Optional request configuration (headers, body)
		* @param timeout - Optional timeout in milliseconds for request cancellation
		* @returns Promise resolving to NetworkResponse with parsed JSON body
		* @throws {AuthError} For timeouts or JSON parsing errors
		* @throws {NetworkError} For network failures
		*/
		async sendRequest(url, method, options, timeout) {
			const controller = new AbortController();
			let timeoutId;
			if (timeout) timeoutId = setTimeout(() => {
				controller.abort();
			}, timeout);
			const fetchOptions = {
				method,
				headers: getFetchHeaders(options),
				signal: controller.signal
			};
			if (method === HttpMethod.POST) fetchOptions.body = options?.body || "";
			let response;
			try {
				response = await fetch(url, fetchOptions);
			} catch (error) {
				if (timeoutId) clearTimeout(timeoutId);
				if (error instanceof Error && error.name === "AbortError") throw createAuthError(networkError, "", "Request timeout");
				throw createNetworkError(createAuthError(networkError, "", `Network request failed: ${error instanceof Error ? error.message : "unknown"}`), void 0, void 0, error instanceof Error ? error : void 0);
			}
			if (timeoutId) clearTimeout(timeoutId);
			try {
				return {
					headers: getHeaderDict(response.headers),
					body: await response.json(),
					status: response.status
				};
			} catch (error) {
				throw createAuthError(tokenParsingError, "", `Failed to parse response: ${error instanceof Error ? error.message : "unknown"}`);
			}
		}
	};
	/**
	* Converts a fetch Headers object to a plain JavaScript object.
	*
	* The fetch API returns headers as a Headers object with methods like get(), has(),
	* etc. However, the rest of the MSAL codebase expects headers as a simple key-value
	* object. This function performs that conversion.
	*
	* @param headers - The Headers object returned by fetch response
	* @returns A plain object with header names as keys and values as strings
	*/
	function getHeaderDict(headers) {
		const headerDict = {};
		headers.forEach((value, key) => {
			headerDict[key] = value;
		});
		return headerDict;
	}
	/**
	* Converts NetworkRequestOptions headers to a fetch-compatible Headers object.
	*
	* The MSAL library uses plain objects for headers in NetworkRequestOptions,
	* but the fetch API expects either a Headers object, plain object, or array
	* of arrays. Using the Headers constructor provides better compatibility
	* and validation.
	*
	* @param options - Optional NetworkRequestOptions containing headers
	* @returns A Headers object ready for use with fetch API
	*/
	function getFetchHeaders(options) {
		const headers = new Headers();
		if (!(options && options.headers)) return headers;
		Object.entries(options.headers).forEach(([key, value]) => {
			headers.append(key, value);
		});
		return headers;
	}
	const invalidFileExtension = "invalid_file_extension";
	const invalidFilePath = "invalid_file_path";
	const invalidManagedIdentityIdType = "invalid_managed_identity_id_type";
	const invalidSecret = "invalid_secret";
	const missingId = "missing_client_id";
	const networkUnavailable = "network_unavailable";
	const platformNotSupported = "platform_not_supported";
	const unableToCreateAzureArc = "unable_to_create_azure_arc";
	const unableToCreateCloudShell = "unable_to_create_cloud_shell";
	const unableToCreateSource = "unable_to_create_source";
	const unableToReadSecretFile = "unable_to_read_secret_file";
	const userAssignedNotAvailableAtRuntime = "user_assigned_not_available_at_runtime";
	const userAssignedManagedIdentityNotConfirmed = "user_assigned_managed_identity_not_confirmed";
	const wwwAuthenticateHeaderMissing = "www_authenticate_header_missing";
	const wwwAuthenticateHeaderUnsupportedFormat = "www_authenticate_header_unsupported_format";
	const MsiEnvironmentVariableUrlMalformedErrorCodes = {
		[ManagedIdentityEnvironmentVariableNames.AZURE_POD_IDENTITY_AUTHORITY_HOST]: "azure_pod_identity_authority_host_url_malformed",
		[ManagedIdentityEnvironmentVariableNames.IDENTITY_ENDPOINT]: "identity_endpoint_url_malformed",
		[ManagedIdentityEnvironmentVariableNames.IMDS_ENDPOINT]: "imds_endpoint_url_malformed",
		[ManagedIdentityEnvironmentVariableNames.MSI_ENDPOINT]: "msi_endpoint_url_malformed"
	};
	/**
	* ManagedIdentityErrorMessage class containing string constants used by error codes and messages.
	*/
	const ManagedIdentityErrorMessages = {
		[invalidFileExtension]: "The file path in the WWW-Authenticate header does not contain a .key file.",
		[invalidFilePath]: "The file path in the WWW-Authenticate header is not in a valid Windows or Linux Format.",
		[invalidManagedIdentityIdType]: "More than one ManagedIdentityIdType was provided.",
		[invalidSecret]: "The secret in the file on the file path in the WWW-Authenticate header is greater than 4096 bytes.",
		[platformNotSupported]: "The platform is not supported by Azure Arc. Azure Arc only supports Windows and Linux.",
		[missingId]: "A ManagedIdentityId id was not provided.",
		[MsiEnvironmentVariableUrlMalformedErrorCodes.AZURE_POD_IDENTITY_AUTHORITY_HOST]: `The Managed Identity's '${ManagedIdentityEnvironmentVariableNames.AZURE_POD_IDENTITY_AUTHORITY_HOST}' environment variable is malformed.`,
		[MsiEnvironmentVariableUrlMalformedErrorCodes.IDENTITY_ENDPOINT]: `The Managed Identity's '${ManagedIdentityEnvironmentVariableNames.IDENTITY_ENDPOINT}' environment variable is malformed.`,
		[MsiEnvironmentVariableUrlMalformedErrorCodes.IMDS_ENDPOINT]: `The Managed Identity's '${ManagedIdentityEnvironmentVariableNames.IMDS_ENDPOINT}' environment variable is malformed.`,
		[MsiEnvironmentVariableUrlMalformedErrorCodes.MSI_ENDPOINT]: `The Managed Identity's '${ManagedIdentityEnvironmentVariableNames.MSI_ENDPOINT}' environment variable is malformed.`,
		[networkUnavailable]: "Authentication unavailable. The request to the managed identity endpoint timed out.",
		[unableToCreateAzureArc]: "Azure Arc Managed Identities can only be system assigned.",
		[unableToCreateCloudShell]: "Cloud Shell Managed Identities can only be system assigned.",
		[unableToCreateSource]: "Unable to create a Managed Identity source based on environment variables.",
		[unableToReadSecretFile]: "Unable to read the secret file.",
		[userAssignedNotAvailableAtRuntime]: "Service Fabric user assigned managed identity ClientId or ResourceId is not configurable at runtime.",
		[userAssignedManagedIdentityNotConfirmed]: "Azure Arc did not confirm the requested user-assigned managed identity in the token response. The agent likely does not support user-assigned managed identity and returned the system-assigned identity.",
		[wwwAuthenticateHeaderMissing]: "A 401 response was received from the Azure Arc Managed Identity, but the www-authenticate header is missing.",
		[wwwAuthenticateHeaderUnsupportedFormat]: "A 401 response was received from the Azure Arc Managed Identity, but the www-authenticate header is in an unsupported format."
	};
	var ManagedIdentityError = class ManagedIdentityError extends AuthError {
		constructor(errorCode, correlationId) {
			super(errorCode, correlationId, ManagedIdentityErrorMessages[errorCode]);
			this.name = "ManagedIdentityError";
			Object.setPrototypeOf(this, ManagedIdentityError.prototype);
		}
	};
	function createManagedIdentityError(errorCode, correlationId) {
		return new ManagedIdentityError(errorCode, correlationId);
	}
	var ManagedIdentityId = class {
		get id() {
			return this._id;
		}
		set id(value) {
			this._id = value;
		}
		get idType() {
			return this._idType;
		}
		set idType(value) {
			this._idType = value;
		}
		constructor(managedIdentityIdParams) {
			const userAssignedClientId = managedIdentityIdParams?.userAssignedClientId;
			const userAssignedResourceId = managedIdentityIdParams?.userAssignedResourceId;
			const userAssignedObjectId = managedIdentityIdParams?.userAssignedObjectId;
			if (userAssignedClientId) {
				if (userAssignedResourceId || userAssignedObjectId) throw createManagedIdentityError(invalidManagedIdentityIdType, "");
				this.id = userAssignedClientId;
				this.idType = ManagedIdentityIdType.USER_ASSIGNED_CLIENT_ID;
			} else if (userAssignedResourceId) {
				if (userAssignedClientId || userAssignedObjectId) throw createManagedIdentityError(invalidManagedIdentityIdType, "");
				this.id = userAssignedResourceId;
				this.idType = ManagedIdentityIdType.USER_ASSIGNED_RESOURCE_ID;
			} else if (userAssignedObjectId) {
				if (userAssignedClientId || userAssignedResourceId) throw createManagedIdentityError(invalidManagedIdentityIdType, "");
				this.id = userAssignedObjectId;
				this.idType = ManagedIdentityIdType.USER_ASSIGNED_OBJECT_ID;
			} else {
				this.id = DEFAULT_MANAGED_IDENTITY_ID;
				this.idType = ManagedIdentityIdType.SYSTEM_ASSIGNED;
			}
		}
	};
	/**
	* NodeAuthErrorMessage class containing string constants used by error codes and messages.
	*/
	const NodeAuthErrorMessage = {
		invalidLoopbackAddressType: {
			code: "invalid_loopback_server_address_type",
			desc: "Loopback server address is not type string. This is unexpected."
		},
		unableToLoadRedirectUri: {
			code: "unable_to_load_redirectUrl",
			desc: "Loopback server callback was invoked without a url. This is unexpected."
		},
		noAuthCodeInResponse: {
			code: "no_auth_code_in_response",
			desc: "No auth code found in the server response. Please check your network trace to determine what happened."
		},
		noLoopbackServerExists: {
			code: "no_loopback_server_exists",
			desc: "No loopback server exists yet."
		},
		loopbackServerAlreadyExists: {
			code: "loopback_server_already_exists",
			desc: "Loopback server already exists. Cannot create another."
		},
		loopbackServerTimeout: {
			code: "loopback_server_timeout",
			desc: "Timed out waiting for auth code listener to be registered."
		},
		loopbackServerQueryResponseNotSupported: {
			code: "loopback_server_query_response_not_supported",
			desc: "The loopback server received an OAuth response in the URL. Interactive authentication requires form_post."
		},
		stateNotFoundError: {
			code: "state_not_found",
			desc: "State not found. Please verify that the request originated from msal."
		},
		thumbprintMissing: {
			code: "thumbprint_missing_from_client_certificate",
			desc: "Client certificate does not contain a SHA-1 or SHA-256 thumbprint."
		},
		redirectUriNotSupported: {
			code: "redirect_uri_not_supported",
			desc: "RedirectUri is not supported in this scenario. Please remove redirectUri from the request."
		},
		unsupportedCcaInstanceAware: {
			code: "unsupported_cca_instance_aware",
			desc: "Instance-aware configuration is not supported by ConfidentialClientApplication."
		}
	};
	var NodeAuthError = class NodeAuthError extends AuthError {
		constructor(errorCode, correlationId, errorMessage) {
			super(errorCode, correlationId, errorMessage);
			this.name = "NodeAuthError";
		}
		/**
		* Creates an error thrown if loopback server address is of type string.
		*/
		static createInvalidLoopbackAddressTypeError() {
			return new NodeAuthError(NodeAuthErrorMessage.invalidLoopbackAddressType.code, "", `${NodeAuthErrorMessage.invalidLoopbackAddressType.desc}`);
		}
		/**
		* Creates an error thrown if the loopback server is unable to get a url.
		*/
		static createUnableToLoadRedirectUrlError() {
			return new NodeAuthError(NodeAuthErrorMessage.unableToLoadRedirectUri.code, "", `${NodeAuthErrorMessage.unableToLoadRedirectUri.desc}`);
		}
		/**
		* Creates an error thrown if the server response does not contain an auth code.
		*/
		static createNoAuthCodeInResponseError(correlationId = "") {
			return new NodeAuthError(NodeAuthErrorMessage.noAuthCodeInResponse.code, correlationId, `${NodeAuthErrorMessage.noAuthCodeInResponse.desc}`);
		}
		/**
		* Creates an error thrown if the loopback server has not been spun up yet.
		*/
		static createNoLoopbackServerExistsError() {
			return new NodeAuthError(NodeAuthErrorMessage.noLoopbackServerExists.code, "", `${NodeAuthErrorMessage.noLoopbackServerExists.desc}`);
		}
		/**
		* Creates an error thrown if a loopback server already exists when attempting to create another one.
		*/
		static createLoopbackServerAlreadyExistsError() {
			return new NodeAuthError(NodeAuthErrorMessage.loopbackServerAlreadyExists.code, "", `${NodeAuthErrorMessage.loopbackServerAlreadyExists.desc}`);
		}
		/**
		* Creates an error thrown if the loopback server times out registering the auth code listener.
		*/
		static createLoopbackServerTimeoutError(correlationId = "") {
			return new NodeAuthError(NodeAuthErrorMessage.loopbackServerTimeout.code, correlationId, `${NodeAuthErrorMessage.loopbackServerTimeout.desc}`);
		}
		/**
		* Creates an error thrown if the loopback server receives an OAuth response in a query string.
		*/
		static createLoopbackServerQueryResponseNotSupportedError() {
			return new NodeAuthError(NodeAuthErrorMessage.loopbackServerQueryResponseNotSupported.code, "", NodeAuthErrorMessage.loopbackServerQueryResponseNotSupported.desc);
		}
		/**
		* Creates an error thrown when the state is not present.
		*/
		static createStateNotFoundError(correlationId = "") {
			return new NodeAuthError(NodeAuthErrorMessage.stateNotFoundError.code, correlationId, NodeAuthErrorMessage.stateNotFoundError.desc);
		}
		/**
		* Creates an error thrown when client certificate was provided, but neither the SHA-1 or SHA-256 thumbprints were provided
		*/
		static createThumbprintMissingError() {
			return new NodeAuthError(NodeAuthErrorMessage.thumbprintMissing.code, "", NodeAuthErrorMessage.thumbprintMissing.desc);
		}
		/**
		* Creates an error thrown when redirectUri is provided in an unsupported scenario
		*/
		static createRedirectUriNotSupportedError(correlationId = "") {
			return new NodeAuthError(NodeAuthErrorMessage.redirectUriNotSupported.code, correlationId, NodeAuthErrorMessage.redirectUriNotSupported.desc);
		}
		/**
		* Creates an error thrown when instance-aware behavior is requested for a confidential client.
		*/
		static createUnsupportedCcaInstanceAwareError(correlationId = "") {
			return new NodeAuthError(NodeAuthErrorMessage.unsupportedCcaInstanceAware.code, correlationId, NodeAuthErrorMessage.unsupportedCcaInstanceAware.desc);
		}
	};
	const DEFAULT_AUTH_OPTIONS = {
		clientId: "",
		authority: DEFAULT_AUTHORITY,
		clientSecret: "",
		clientAssertion: "",
		clientCertificate: {
			thumbprint: "",
			thumbprintSha256: "",
			privateKey: "",
			x5c: ""
		},
		knownAuthorities: [],
		cloudDiscoveryMetadata: "",
		authorityMetadata: "",
		clientCapabilities: [],
		azureCloudOptions: {
			azureCloudInstance: AzureCloudInstance.None,
			tenant: ""
		},
		isMcp: false
	};
	const DEFAULT_LOGGER_OPTIONS = {
		loggerCallback: () => {},
		piiLoggingEnabled: false,
		logLevel: exports.LogLevel.Info
	};
	const DEFAULT_SYSTEM_OPTIONS = {
		loggerOptions: DEFAULT_LOGGER_OPTIONS,
		networkClient: new HttpClient(),
		disableInternalRetries: false,
		protocolMode: ProtocolMode.AAD
	};
	const DEFAULT_TELEMETRY_OPTIONS = { application: {
		appName: "",
		appVersion: ""
	} };
	/**
	* Sets the default options when not explicitly configured from app developer
	*
	* @param auth - Authentication options
	* @param cache - Cache options
	* @param system - System options
	* @param telemetry - Telemetry options
	*
	* @returns Configuration
	* @internal
	*/
	function buildAppConfiguration({ auth, broker, cache, system, telemetry }) {
		const systemOptions = {
			...DEFAULT_SYSTEM_OPTIONS,
			networkClient: new HttpClient(),
			loggerOptions: system?.loggerOptions || DEFAULT_LOGGER_OPTIONS,
			disableInternalRetries: system?.disableInternalRetries || false
		};
		if (!!auth.clientCertificate && !!!auth.clientCertificate.thumbprint && !!!auth.clientCertificate.thumbprintSha256) throw NodeAuthError.createStateNotFoundError();
		return {
			auth: {
				...DEFAULT_AUTH_OPTIONS,
				...auth
			},
			broker: { ...broker },
			cache: { ...cache },
			system: {
				...systemOptions,
				...system
			},
			telemetry: {
				...DEFAULT_TELEMETRY_OPTIONS,
				...telemetry
			}
		};
	}
	function buildManagedIdentityConfiguration({ clientCapabilities, managedIdentityIdParams, system }) {
		const managedIdentityId = new ManagedIdentityId(managedIdentityIdParams);
		const loggerOptions = system?.loggerOptions || DEFAULT_LOGGER_OPTIONS;
		let networkClient;
		if (system?.networkClient) networkClient = system.networkClient;
		else networkClient = new HttpClient();
		return {
			clientCapabilities: clientCapabilities || [],
			managedIdentityId,
			system: {
				loggerOptions,
				networkClient
			},
			disableInternalRetries: system?.disableInternalRetries || false
		};
	}
	var GuidGenerator = class {
		/**
		* Generates a random [RFC 4122](https://www.rfc-editor.org/rfc/rfc4122.txt) version 4 UUID. The UUID is generated using a
		* cryptographic pseudorandom number generator.
		*/
		generateGuid() {
			return node_crypto.randomUUID();
		}
		/**
		* verifies if a string is  GUID
		* @param guid
		*/
		isGuid(guid) {
			return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(guid);
		}
	};
	var EncodingUtils = class EncodingUtils {
		/**
		* 'utf8': Multibyte encoded Unicode characters. Many web pages and other document formats use UTF-8.
		* 'base64': Base64 encoding.
		*
		* @param str text
		*/
		static base64Encode(str, encoding) {
			return Buffer.from(str, encoding).toString(EncodingTypes.BASE64);
		}
		/**
		* encode a URL
		* @param str
		*/
		static base64EncodeUrl(str, encoding) {
			return EncodingUtils.base64Encode(str, encoding).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
		}
		/**
		* 'utf8': Multibyte encoded Unicode characters. Many web pages and other document formats use UTF-8.
		* 'base64': Base64 encoding.
		*
		* @param base64Str Base64 encoded text
		*/
		static base64Decode(base64Str) {
			return Buffer.from(base64Str, EncodingTypes.BASE64).toString("utf8");
		}
		/**
		* @param base64Str Base64 encoded Url
		*/
		static base64DecodeUrl(base64Str) {
			let str = base64Str.replace(/-/g, "+").replace(/_/g, "/");
			while (str.length % 4) str += "=";
			return EncodingUtils.base64Decode(str);
		}
	};
	var HashUtils = class {
		/**
		* generate 'SHA256' hash
		* @param buffer
		*/
		sha256(buffer) {
			return crypto$1.createHash(Hash.SHA256).update(buffer).digest();
		}
	};
	/**
	* https://tools.ietf.org/html/rfc7636#page-8
	*/
	var PkceGenerator = class {
		constructor() {
			this.hashUtils = new HashUtils();
		}
		/**
		* generates the codeVerfier and the challenge from the codeVerfier
		* reference: https://tools.ietf.org/html/rfc7636#section-4.1 and https://tools.ietf.org/html/rfc7636#section-4.2
		*/
		async generatePkceCodes() {
			const verifier = this.generateCodeVerifier();
			return {
				verifier,
				challenge: this.generateCodeChallengeFromVerifier(verifier)
			};
		}
		/**
		* generates the codeVerfier; reference: https://tools.ietf.org/html/rfc7636#section-4.1
		*/
		generateCodeVerifier() {
			const charArr = [];
			const maxNumber = 256 - 256 % CharSet.CV_CHARSET.length;
			while (charArr.length <= RANDOM_OCTET_SIZE) {
				const byte = crypto$1.randomBytes(1)[0];
				if (byte >= maxNumber) continue;
				const index = byte % CharSet.CV_CHARSET.length;
				charArr.push(CharSet.CV_CHARSET[index]);
			}
			const verifier = charArr.join("");
			return EncodingUtils.base64EncodeUrl(verifier);
		}
		/**
		* generate the challenge from the codeVerfier; reference: https://tools.ietf.org/html/rfc7636#section-4.2
		* @param codeVerifier
		*/
		generateCodeChallengeFromVerifier(codeVerifier) {
			return EncodingUtils.base64EncodeUrl(this.hashUtils.sha256(codeVerifier).toString(EncodingTypes.BASE64), EncodingTypes.BASE64);
		}
	};
	/**
	* This class implements MSAL node's crypto interface, which allows it to perform base64 encoding and decoding, generating cryptographically random GUIDs and
	* implementing Proof Key for Code Exchange specs for the OAuth Authorization Code Flow using PKCE (rfc here: https://tools.ietf.org/html/rfc7636).
	* @public
	*/
	var CryptoProvider = class {
		constructor() {
			this.pkceGenerator = new PkceGenerator();
			this.guidGenerator = new GuidGenerator();
			this.hashUtils = new HashUtils();
		}
		/**
		* base64 URL safe encoded string
		*/
		base64UrlEncode() {
			throw new Error("Method not implemented.");
		}
		/**
		* Stringifies and base64Url encodes input public key
		* @param inputKid - public key id
		* @returns Base64Url encoded public key
		*/
		encodeKid() {
			throw new Error("Method not implemented.");
		}
		/**
		* Creates a new random GUID - used to populate state and nonce.
		* @returns string (GUID)
		*/
		createNewGuid() {
			return this.guidGenerator.generateGuid();
		}
		/**
		* Encodes input string to base64.
		* @param input - string to be encoded
		*/
		base64Encode(input) {
			return EncodingUtils.base64Encode(input);
		}
		/**
		* Decodes input string from base64.
		* @param input - string to be decoded
		*/
		base64Decode(input) {
			return EncodingUtils.base64Decode(input);
		}
		/**
		* Generates PKCE codes used in Authorization Code Flow.
		*/
		generatePkceCodes() {
			return this.pkceGenerator.generatePkceCodes();
		}
		/**
		* Removes cryptographic keypair from key store matching the keyId passed in
		* @param kid - public key id
		* @param correlationId - correlation id
		*/
		removeTokenBindingKey(kid, correlationId) {
			throw new Error("Method not implemented.");
		}
		/**
		* Removes all cryptographic keys from Keystore
		* @param correlationId - correlation id
		*/
		clearKeystore(correlationId) {
			throw new Error("Method not implemented.");
		}
		/**
		* Signs a compact JWT with a token-binding key - not yet implemented for node
		* @param header - JOSE header
		* @param payload - JWT payload
		* @param kid - public key id
		* @param correlationId - correlation id
		*/
		signTokenBindingJwt(header, payload, kid, correlationId) {
			throw createClientAuthError(methodNotImplemented, correlationId);
		}
		/**
		* Returns the SHA-256 hash of an input string
		*/
		async hashString(plainText) {
			return EncodingUtils.base64EncodeUrl(this.hashUtils.sha256(plainText).toString(EncodingTypes.BASE64), EncodingTypes.BASE64);
		}
	};
	/**
	* Computes a combined hash from additional cache key components.
	*
	* Matches the cross-SDK algorithm: sort keys ascending → for each key append a
	* length-prefixed (netstring-style) encoding of the key and value → SHA-256 →
	* Base64URL (no padding).
	*
	* Each entry is encoded as `<byteLen(key)>:<key><byteLen(value)>:<value>` where the
	* lengths are the UTF-8 **byte** lengths (via `Buffer.byteLength`, not `String.length`
	* which counts UTF-16 code units). The length prefixes make the serialization injective
	* so that semantically different component sets can never serialize to the same byte
	* string. A plain delimiter-less concatenation of key+value is ambiguous
	* (e.g. `{fmi_path:"value"}` and `{fmi_pat:"hvalue"}` would both yield `fmi_pathvalue`),
	* which would collide into the same credential cache slot.
	*
	* The encoding is byte-identical to the other MSAL SDKs (Go/.NET/Java/Python), so the
	* resulting hash is a stable cross-SDK cache key. The final credential key is lowercased
	* downstream in `generateCredentialKey`.
	*/
	function computeAdditionalCacheKeyHash(components) {
		const sortedKeys = Object.keys(components).sort();
		let input = "";
		for (const key of sortedKeys) {
			const value = components[key];
			input += `${Buffer.byteLength(key, "utf8")}:${key}${Buffer.byteLength(value, "utf8")}:${value}`;
		}
		return crypto$1.createHash("sha256").update(input, "utf8").digest("base64url");
	}
	function generateCredentialKey(credential, hash) {
		const familyId = credential.credentialType === CredentialType.REFRESH_TOKEN && credential.familyId || credential.clientId;
		const scheme = credential.tokenType && credential.tokenType.toLowerCase() !== AuthenticationScheme.BEARER.toLowerCase() ? credential.tokenType.toLowerCase() : "";
		const credentialKey = [
			credential.homeAccountId,
			credential.environment,
			credential.credentialType,
			familyId,
			credential.realm || "",
			credential.target || "",
			scheme
		];
		if (credential.additionalCacheKeyComponents && Object.keys(credential.additionalCacheKeyComponents).length > 0) credentialKey.push(hash ?? computeAdditionalCacheKeyHash(credential.additionalCacheKeyComponents));
		return credentialKey.join(CACHE.KEY_SEPARATOR).toLowerCase();
	}
	function generateAccountKey(account) {
		const homeTenantId = account.homeAccountId.split(".")[1];
		return [
			account.homeAccountId,
			account.environment,
			homeTenantId || account.tenantId || ""
		].join(CACHE.KEY_SEPARATOR).toLowerCase();
	}
	/**
	* This class implements Storage for node, reading cache from user specified storage location or an  extension library
	* @public
	*/
	var NodeStorage = class extends CacheManager {
		constructor(logger, clientId, cryptoImpl, staticAuthorityOptions) {
			super(clientId, cryptoImpl, logger, new StubPerformanceClient(), staticAuthorityOptions, DEFAULT_TOKEN_BINDING_KEY_MANAGER);
			this.cache = {};
			this.changeEmitters = [];
			this.logger = logger;
		}
		/**
		* Queue up callbacks
		* @param func - a callback function for cache change indication
		*/
		registerChangeEmitter(func) {
			this.changeEmitters.push(func);
		}
		/**
		* Invoke the callback when cache changes
		*/
		emitChange() {
			this.changeEmitters.forEach((func) => func.call(null));
		}
		/**
		* Converts cacheKVStore to InMemoryCache
		* @param cache - key value store
		*/
		cacheToInMemoryCache(cache) {
			const inMemoryCache = {
				accounts: {},
				idTokens: {},
				accessTokens: {},
				refreshTokens: {},
				appMetadata: {}
			};
			for (const key in cache) {
				const value = cache[key];
				if (typeof value !== "object") continue;
				if (isAccountEntity(value)) inMemoryCache.accounts[key] = value;
				else if (isIdTokenEntity(value)) inMemoryCache.idTokens[key] = value;
				else if (isAccessTokenEntity(value)) inMemoryCache.accessTokens[key] = value;
				else if (isRefreshTokenEntity(value)) inMemoryCache.refreshTokens[key] = value;
				else if (isAppMetadataEntity(key, value)) inMemoryCache.appMetadata[key] = value;
				else continue;
			}
			return inMemoryCache;
		}
		/**
		* converts inMemoryCache to CacheKVStore
		* @param inMemoryCache - kvstore map for inmemory
		*/
		inMemoryCacheToCache(inMemoryCache) {
			let cache = this.getCache();
			cache = {
				...cache,
				...inMemoryCache.accounts,
				...inMemoryCache.idTokens,
				...inMemoryCache.accessTokens,
				...inMemoryCache.refreshTokens,
				...inMemoryCache.appMetadata
			};
			return cache;
		}
		/**
		* gets the current in memory cache for the client
		*/
		getInMemoryCache() {
			this.logger.trace("Getting in-memory cache", "");
			return this.cacheToInMemoryCache(this.getCache());
		}
		/**
		* sets the current in memory cache for the client
		* @param inMemoryCache - key value map in memory
		*/
		setInMemoryCache(inMemoryCache) {
			this.logger.trace("Setting in-memory cache", "");
			const cache = this.inMemoryCacheToCache(inMemoryCache);
			this.setCache(cache);
			this.emitChange();
		}
		/**
		* get the current cache key-value store
		*/
		getCache() {
			this.logger.trace("Getting cache key-value store", "");
			return this.cache;
		}
		/**
		* sets the current cache (key value store)
		* @param cacheMap - key value map
		*/
		setCache(cache) {
			this.logger.trace("Setting cache key value store", "");
			this.cache = cache;
			this.emitChange();
		}
		/**
		* Gets cache item with given key.
		* @param key - lookup key for the cache entry
		*/
		getItem(key) {
			this.logger.tracePii(`Item key: ${key}`, "");
			return this.getCache()[key];
		}
		/**
		* Gets cache item with given key-value
		* @param key - lookup key for the cache entry
		* @param value - value of the cache entry
		*/
		setItem(key, value) {
			this.logger.tracePii(`Item key: ${key}`, "");
			const cache = this.getCache();
			cache[key] = value;
			this.setCache(cache);
		}
		generateCredentialKey(credential, additionalCacheKeyHash) {
			return generateCredentialKey(credential, additionalCacheKeyHash);
		}
		generateAccountKey(account) {
			return generateAccountKey(account);
		}
		getAccountKeys() {
			const inMemoryCache = this.getInMemoryCache();
			return Object.keys(inMemoryCache.accounts);
		}
		getTokenKeys() {
			const inMemoryCache = this.getInMemoryCache();
			return {
				idToken: Object.keys(inMemoryCache.idTokens),
				accessToken: Object.keys(inMemoryCache.accessTokens),
				refreshToken: Object.keys(inMemoryCache.refreshTokens)
			};
		}
		/**
		* Reads account from cache, builds it into an account entity and returns it.
		* @param accountKey - lookup key to fetch cache type AccountEntity
		* @returns
		*/
		getAccount(accountKey) {
			const cachedAccount = this.getItem(accountKey);
			return cachedAccount && typeof cachedAccount === "object" ? { ...cachedAccount } : null;
		}
		/**
		* set account entity
		* @param account - cache value to be set of type AccountEntity
		*/
		async setAccount(account) {
			const accountKey = this.generateAccountKey(getAccountInfo(account));
			this.setItem(accountKey, account);
		}
		/**
		* fetch the idToken credential
		* @param idTokenKey - lookup key to fetch cache type IdTokenEntity
		*/
		getIdTokenCredential(idTokenKey) {
			const idToken = this.getItem(idTokenKey);
			if (isIdTokenEntity(idToken)) return idToken;
			return null;
		}
		/**
		* set idToken credential
		* @param idToken - cache value to be set of type IdTokenEntity
		*/
		async setIdTokenCredential(idToken) {
			const idTokenKey = this.generateCredentialKey(idToken);
			this.setItem(idTokenKey, idToken);
		}
		/**
		* fetch the accessToken credential
		* @param accessTokenKey - lookup key to fetch cache type AccessTokenEntity
		*/
		getAccessTokenCredential(accessTokenKey) {
			const accessToken = this.getItem(accessTokenKey);
			if (isAccessTokenEntity(accessToken)) return accessToken;
			return null;
		}
		/**
		* Set accessToken credential to the cache
		* @param accessToken - the access token entity to cache
		* @param _correlationId - unique identifier for the request
		* @param _kmsi - keep me signed in flag
		* @param additionalCacheKeyHash - optional precomputed hash of additionalCacheKeyComponents used in key generation
		*/
		async setAccessTokenCredential(accessToken, _correlationId, _kmsi, additionalCacheKeyHash) {
			const accessTokenKey = this.generateCredentialKey(accessToken, additionalCacheKeyHash);
			this.setItem(accessTokenKey, accessToken);
		}
		/**
		* fetch the refreshToken credential
		* @param refreshTokenKey - lookup key to fetch cache type RefreshTokenEntity
		*/
		getRefreshTokenCredential(refreshTokenKey) {
			const refreshToken = this.getItem(refreshTokenKey);
			if (isRefreshTokenEntity(refreshToken)) return refreshToken;
			return null;
		}
		/**
		* set refreshToken credential
		* @param refreshToken - cache value to be set of type RefreshTokenEntity
		*/
		async setRefreshTokenCredential(refreshToken) {
			const refreshTokenKey = this.generateCredentialKey(refreshToken);
			this.setItem(refreshTokenKey, refreshToken);
		}
		/**
		* fetch appMetadata entity from the platform cache
		* @param appMetadataKey - lookup key to fetch cache type AppMetadataEntity
		*/
		getAppMetadata(appMetadataKey) {
			const appMetadata = this.getItem(appMetadataKey);
			if (isAppMetadataEntity(appMetadataKey, appMetadata)) return appMetadata;
			return null;
		}
		/**
		* set appMetadata entity to the platform cache
		* @param appMetadata - cache value to be set of type AppMetadataEntity
		*/
		setAppMetadata(appMetadata) {
			const appMetadataKey = generateAppMetadataKey(appMetadata);
			this.setItem(appMetadataKey, appMetadata);
		}
		/**
		* fetch server telemetry entity from the platform cache
		* @param serverTelemetrykey - lookup key to fetch cache type ServerTelemetryEntity
		*/
		getServerTelemetry(serverTelemetrykey) {
			const serverTelemetryEntity = this.getItem(serverTelemetrykey);
			if (serverTelemetryEntity && isServerTelemetryEntity(serverTelemetrykey, serverTelemetryEntity)) return serverTelemetryEntity;
			return null;
		}
		/**
		* set server telemetry entity to the platform cache
		* @param serverTelemetryKey - lookup key to fetch cache type ServerTelemetryEntity
		* @param serverTelemetry - cache value to be set of type ServerTelemetryEntity
		*/
		setServerTelemetry(serverTelemetryKey, serverTelemetry) {
			this.setItem(serverTelemetryKey, serverTelemetry);
		}
		/**
		* fetch authority metadata entity from the platform cache
		* @param key - lookup key to fetch cache type AuthorityMetadataEntity
		*/
		getAuthorityMetadata(key) {
			const authorityMetadataEntity = this.getItem(key);
			if (authorityMetadataEntity && isAuthorityMetadataEntity(key, authorityMetadataEntity)) return authorityMetadataEntity;
			return null;
		}
		/**
		* Get all authority metadata keys
		*/
		getAuthorityMetadataKeys() {
			return this.getKeys().filter((key) => {
				return this.isAuthorityMetadata(key);
			});
		}
		/**
		* set authority metadata entity to the platform cache
		* @param key - lookup key to fetch cache type AuthorityMetadataEntity
		* @param metadata - cache value to be set of type AuthorityMetadataEntity
		*/
		setAuthorityMetadata(key, metadata) {
			this.setItem(key, metadata);
		}
		/**
		* fetch throttling entity from the platform cache
		* @param throttlingCacheKey - lookup key to fetch cache type ThrottlingEntity
		*/
		getThrottlingCache(throttlingCacheKey) {
			const throttlingCache = this.getItem(throttlingCacheKey);
			if (throttlingCache && isThrottlingEntity(throttlingCacheKey, throttlingCache)) return throttlingCache;
			return null;
		}
		/**
		* set throttling entity to the platform cache
		* @param throttlingCacheKey - lookup key to fetch cache type ThrottlingEntity
		* @param throttlingCache - cache value to be set of type ThrottlingEntity
		*/
		setThrottlingCache(throttlingCacheKey, throttlingCache) {
			this.setItem(throttlingCacheKey, throttlingCache);
		}
		/**
		* Removes the cache item from memory with the given key.
		* @param key - lookup key to remove a cache entity
		* @param inMemory - key value map of the cache
		*/
		removeItem(key) {
			this.logger.tracePii(`Item key: ${key}`, "");
			let result = false;
			const cache = this.getCache();
			if (!!cache[key]) {
				delete cache[key];
				result = true;
			}
			if (result) {
				this.setCache(cache);
				this.emitChange();
			}
			return result;
		}
		/**
		* Remove account entity from the platform cache if it's outdated
		* @param accountKey - lookup key to fetch cache type AccountEntity
		*/
		removeOutdatedAccount(accountKey) {
			this.removeItem(accountKey);
		}
		/**
		* Checks whether key is in cache.
		* @param key - look up key for a cache entity
		*/
		containsKey(key) {
			return this.getKeys().includes(key);
		}
		/**
		* Gets all keys in window.
		*/
		getKeys() {
			this.logger.trace("Retrieving all cache keys", "");
			const cache = this.getCache();
			return [...Object.keys(cache)];
		}
		/**
		* Clears all cache entries created by MSAL except authority metadata..
		*/
		clear() {
			this.logger.trace("Clearing cache entries created by MSAL", "");
			this.getKeys().forEach((key) => {
				if (this.isAuthorityMetadata(key)) return;
				this.removeItem(key);
			});
			this.emitChange();
		}
		/**
		* Initialize in memory cache from an exisiting cache vault
		* @param cache - blob formatted cache (JSON)
		*/
		static generateInMemoryCache(cache) {
			return Deserializer.deserializeAllCache(Deserializer.deserializeJSONBlob(cache));
		}
		/**
		* retrieves the final JSON
		* @param inMemoryCache - itemised cache read from the JSON
		*/
		static generateJsonCache(inMemoryCache) {
			return Serializer.serializeAllCache(inMemoryCache);
		}
		/**
		* Updates a credential's cache key if the current cache key is outdated
		*/
		updateCredentialCacheKey(currentCacheKey, credential) {
			const updatedCacheKey = this.generateCredentialKey(credential);
			if (currentCacheKey !== updatedCacheKey) {
				const cacheItem = this.getItem(currentCacheKey);
				if (cacheItem) {
					this.removeItem(currentCacheKey);
					this.setItem(updatedCacheKey, cacheItem);
					this.logger.verbose(`Updated an outdated ${credential.credentialType} cache key`, "");
					return updatedCacheKey;
				} else this.logger.error(`Attempted to update an outdated ${credential.credentialType} cache key but no item matching the outdated key was found in storage`, "");
			}
			return currentCacheKey;
		}
	};
	const defaultSerializedCache = {
		Account: {},
		IdToken: {},
		AccessToken: {},
		RefreshToken: {},
		AppMetadata: {}
	};
	/**
	* In-memory token cache manager
	* @public
	*/
	var TokenCache = class {
		constructor(storage, logger, cachePlugin) {
			this.cacheHasChanged = false;
			this.storage = storage;
			this.storage.registerChangeEmitter(this.handleChangeEvent.bind(this));
			if (cachePlugin) this.persistence = cachePlugin;
			this.logger = logger;
		}
		/**
		* Set to true if cache state has changed since last time serialize or writeToPersistence was called
		*/
		hasChanged() {
			return this.cacheHasChanged;
		}
		/**
		* Serializes in memory cache to JSON
		*/
		serialize() {
			this.logger.trace("Serializing in-memory cache", "");
			let finalState = Serializer.serializeAllCache(this.storage.getInMemoryCache());
			if (this.cacheSnapshot) {
				this.logger.trace("Reading cache snapshot from disk", "");
				finalState = this.mergeState(JSON.parse(this.cacheSnapshot), finalState);
			} else this.logger.trace("No cache snapshot to merge", "");
			this.cacheHasChanged = false;
			return JSON.stringify(finalState);
		}
		/**
		* Deserializes JSON to in-memory cache. JSON should be in MSAL cache schema format
		* @param cache - blob formatted cache
		*/
		deserialize(cache) {
			this.logger.trace("Deserializing JSON to in-memory cache", "");
			this.cacheSnapshot = cache;
			if (this.cacheSnapshot) {
				this.logger.trace("Reading cache snapshot from disk", "");
				const deserializedCache = Deserializer.deserializeAllCache(this.overlayDefaults(JSON.parse(this.cacheSnapshot)));
				this.storage.setInMemoryCache(deserializedCache);
			} else this.logger.trace("No cache snapshot to deserialize", "");
		}
		/**
		* Fetches the cache key-value map
		*/
		getKVStore() {
			return this.storage.getCache();
		}
		/**
		* Gets cache snapshot in CacheKVStore format
		*/
		getCacheSnapshot() {
			const deserializedPersistentStorage = NodeStorage.generateInMemoryCache(this.cacheSnapshot);
			return this.storage.inMemoryCacheToCache(deserializedPersistentStorage);
		}
		/**
		* API that retrieves all accounts currently in cache to the user
		*/
		async getAllAccounts(correlationId = new CryptoProvider().createNewGuid()) {
			this.logger.trace("getAllAccounts called", correlationId);
			let cacheContext;
			try {
				if (this.persistence) {
					cacheContext = new TokenCacheContext(this, false);
					await this.persistence.beforeCacheAccess(cacheContext);
				}
				return this.storage.getAllAccounts({}, correlationId);
			} finally {
				if (this.persistence && cacheContext) await this.persistence.afterCacheAccess(cacheContext);
			}
		}
		/**
		* Returns the signed in account matching homeAccountId.
		* (the account object is created at the time of successful login)
		* or null when no matching account is found
		* @param homeAccountId - unique identifier for an account (uid.utid)
		*/
		async getAccountByHomeId(homeAccountId) {
			const allAccounts = await this.getAllAccounts();
			if (homeAccountId && allAccounts && allAccounts.length) return allAccounts.filter((accountObj) => accountObj.homeAccountId === homeAccountId)[0] || null;
			else return null;
		}
		/**
		* Returns the signed in account matching localAccountId.
		* (the account object is created at the time of successful login)
		* or null when no matching account is found
		* @param localAccountId - unique identifier of an account (sub/obj when homeAccountId cannot be populated)
		*/
		async getAccountByLocalId(localAccountId) {
			const allAccounts = await this.getAllAccounts();
			if (localAccountId && allAccounts && allAccounts.length) return allAccounts.filter((accountObj) => accountObj.localAccountId === localAccountId)[0] || null;
			else return null;
		}
		/**
		* API to remove a specific account and the relevant data from cache
		* @param account - AccountInfo passed by the user
		*/
		async removeAccount(account, correlationId) {
			this.logger.trace("removeAccount called", correlationId || "");
			let cacheContext;
			try {
				if (this.persistence) {
					cacheContext = new TokenCacheContext(this, true);
					await this.persistence.beforeCacheAccess(cacheContext);
				}
				this.storage.removeAccount(account, correlationId || new GuidGenerator().generateGuid());
			} finally {
				if (this.persistence && cacheContext) await this.persistence.afterCacheAccess(cacheContext);
			}
		}
		/**
		* Overwrites in-memory cache with persistent cache
		*/
		async overwriteCache() {
			if (!this.persistence) {
				this.logger.info("No persistence layer specified, cache cannot be overwritten", "");
				return;
			}
			this.logger.info("Overwriting in-memory cache with persistent cache", "");
			this.storage.clear();
			const cacheContext = new TokenCacheContext(this, false);
			await this.persistence.beforeCacheAccess(cacheContext);
			const cacheSnapshot = this.getCacheSnapshot();
			this.storage.setCache(cacheSnapshot);
			await this.persistence.afterCacheAccess(cacheContext);
		}
		/**
		* Called when the cache has changed state.
		*/
		handleChangeEvent() {
			this.cacheHasChanged = true;
		}
		/**
		* Merge in memory cache with the cache snapshot.
		* @param oldState - cache before changes
		* @param currentState - current cache state in the library
		*/
		mergeState(oldState, currentState) {
			this.logger.trace("Merging in-memory cache with cache snapshot", "");
			const stateAfterRemoval = this.mergeRemovals(oldState, currentState);
			return this.mergeUpdates(stateAfterRemoval, currentState);
		}
		/**
		* Deep update of oldState based on newState values
		* @param oldState - cache before changes
		* @param newState - updated cache
		*/
		mergeUpdates(oldState, newState) {
			Object.keys(newState).forEach((newKey) => {
				const newValue = newState[newKey];
				if (!oldState.hasOwnProperty(newKey)) {
					if (newValue !== null) oldState[newKey] = newValue;
				} else {
					const newValueNotNull = newValue !== null;
					const newValueIsObject = typeof newValue === "object";
					const newValueIsNotArray = !Array.isArray(newValue);
					const oldStateNotUndefinedOrNull = typeof oldState[newKey] !== "undefined" && oldState[newKey] !== null;
					if (newValueNotNull && newValueIsObject && newValueIsNotArray && oldStateNotUndefinedOrNull) this.mergeUpdates(oldState[newKey], newValue);
					else oldState[newKey] = newValue;
				}
			});
			return oldState;
		}
		/**
		* Removes entities in oldState that the were removed from newState. If there are any unknown values in root of
		* oldState that are not recognized, they are left untouched.
		* @param oldState - cache before changes
		* @param newState - updated cache
		*/
		mergeRemovals(oldState, newState) {
			this.logger.trace("Remove updated entries in cache", "");
			const accounts = oldState.Account ? this.mergeRemovalsDict(oldState.Account, newState.Account) : oldState.Account;
			const accessTokens = oldState.AccessToken ? this.mergeRemovalsDict(oldState.AccessToken, newState.AccessToken) : oldState.AccessToken;
			const refreshTokens = oldState.RefreshToken ? this.mergeRemovalsDict(oldState.RefreshToken, newState.RefreshToken) : oldState.RefreshToken;
			const idTokens = oldState.IdToken ? this.mergeRemovalsDict(oldState.IdToken, newState.IdToken) : oldState.IdToken;
			const appMetadata = oldState.AppMetadata ? this.mergeRemovalsDict(oldState.AppMetadata, newState.AppMetadata) : oldState.AppMetadata;
			return {
				...oldState,
				Account: accounts,
				AccessToken: accessTokens,
				RefreshToken: refreshTokens,
				IdToken: idTokens,
				AppMetadata: appMetadata
			};
		}
		/**
		* Helper to merge new cache with the old one
		* @param oldState - cache before changes
		* @param newState - updated cache
		*/
		mergeRemovalsDict(oldState, newState) {
			const finalState = { ...oldState };
			Object.keys(oldState).forEach((oldKey) => {
				if (!newState || !newState.hasOwnProperty(oldKey)) delete finalState[oldKey];
			});
			return finalState;
		}
		/**
		* Helper to overlay as a part of cache merge
		* @param passedInCache - cache read from the blob
		*/
		overlayDefaults(passedInCache) {
			this.logger.trace("Overlaying input cache with the default cache", "");
			return {
				Account: {
					...defaultSerializedCache.Account,
					...passedInCache.Account
				},
				IdToken: {
					...defaultSerializedCache.IdToken,
					...passedInCache.IdToken
				},
				AccessToken: {
					...defaultSerializedCache.AccessToken,
					...passedInCache.AccessToken
				},
				RefreshToken: {
					...defaultSerializedCache.RefreshToken,
					...passedInCache.RefreshToken
				},
				AppMetadata: {
					...defaultSerializedCache.AppMetadata,
					...passedInCache.AppMetadata
				}
			};
		}
	};
	const missingTenantIdError = "missing_tenant_id_error";
	const userTimeoutReached = "user_timeout_reached";
	const invalidAssertion = "invalid_assertion";
	const invalidClientCredential = "invalid_client_credential";
	const emptyFicAssertion = "empty_fic_assertion";
	const conflictingUserIdentifiers = "conflicting_user_identifiers";
	const missingUserIdentifier = "missing_user_identifier";
	const deviceCodePollingCancelled = "device_code_polling_cancelled";
	const deviceCodeExpired = "device_code_expired";
	const deviceCodeUnknownError = "device_code_unknown_error";
	/**
	* Client assertion of type jwt-bearer used in confidential client flows
	* @public
	*/
	var ClientAssertion = class ClientAssertion {
		/**
		* Initialize the ClientAssertion class from the clientAssertion passed by the user
		* @param assertion - refer https://tools.ietf.org/html/rfc7521
		*/
		static fromAssertion(assertion) {
			const clientAssertion = new ClientAssertion();
			clientAssertion.jwt = assertion;
			return clientAssertion;
		}
		/**
		* @deprecated Use fromCertificateWithSha256Thumbprint instead, with a SHA-256 thumprint
		* Initialize the ClientAssertion class from the certificate passed by the user
		* @param thumbprint - identifier of a certificate
		* @param privateKey - secret key
		* @param publicCertificate - electronic document provided to prove the ownership of the public key
		*/
		static fromCertificate(thumbprint, privateKey, publicCertificate) {
			const clientAssertion = new ClientAssertion();
			clientAssertion.privateKey = privateKey;
			clientAssertion.thumbprint = thumbprint;
			clientAssertion.useSha256 = false;
			if (publicCertificate) clientAssertion.publicCertificate = this.parseCertificate(publicCertificate);
			return clientAssertion;
		}
		/**
		* Initialize the ClientAssertion class from the certificate passed by the user
		* @param thumbprint - identifier of a certificate
		* @param privateKey - secret key
		* @param publicCertificate - electronic document provided to prove the ownership of the public key
		*/
		static fromCertificateWithSha256Thumbprint(thumbprint, privateKey, publicCertificate) {
			const clientAssertion = new ClientAssertion();
			clientAssertion.privateKey = privateKey;
			clientAssertion.thumbprint = thumbprint;
			clientAssertion.useSha256 = true;
			if (publicCertificate) clientAssertion.publicCertificate = this.parseCertificate(publicCertificate);
			return clientAssertion;
		}
		/**
		* Update JWT for certificate based clientAssertion, if passed by the user, uses it as is
		* @param cryptoProvider - library's crypto helper
		* @param issuer - iss claim
		* @param jwtAudience - aud claim
		*/
		getJwt(cryptoProvider, issuer, jwtAudience) {
			if (this.privateKey && this.thumbprint) {
				if (this.jwt && !this.isExpired() && issuer === this.issuer && jwtAudience === this.jwtAudience) return this.jwt;
				return this.createJwt(cryptoProvider, issuer, jwtAudience);
			}
			if (this.jwt) return this.jwt;
			throw createClientAuthError(invalidAssertion, "");
		}
		/**
		* JWT format and required claims specified: https://tools.ietf.org/html/rfc7523#section-3
		*/
		createJwt(cryptoProvider, issuer, jwtAudience) {
			this.issuer = issuer;
			this.jwtAudience = jwtAudience;
			const issuedAt = nowSeconds();
			this.expirationTime = issuedAt + 600;
			const header = { alg: this.useSha256 ? JwtConstants.PSS_256 : JwtConstants.RSA_256 };
			const thumbprintHeader = this.useSha256 ? JwtConstants.X5T_256 : JwtConstants.X5T;
			Object.assign(header, { [thumbprintHeader]: EncodingUtils.base64EncodeUrl(this.thumbprint, EncodingTypes.HEX) });
			if (this.publicCertificate) Object.assign(header, { [JwtConstants.X5C]: this.publicCertificate });
			const payload = {
				[JwtConstants.AUDIENCE]: this.jwtAudience,
				[JwtConstants.EXPIRATION_TIME]: this.expirationTime,
				[JwtConstants.ISSUER]: this.issuer,
				[JwtConstants.SUBJECT]: this.issuer,
				[JwtConstants.NOT_BEFORE]: issuedAt,
				[JwtConstants.JWT_ID]: cryptoProvider.createNewGuid()
			};
			this.jwt = jwt.sign(payload, this.privateKey, { header });
			return this.jwt;
		}
		/**
		* Utility API to check expiration
		*/
		isExpired() {
			return this.expirationTime < nowSeconds();
		}
		/**
		* Extracts the raw certs from a given certificate string and returns them in an array.
		* @param publicCertificate - electronic document provided to prove the ownership of the public key
		*/
		static parseCertificate(publicCertificate) {
			/**
			* This is regex to identify the certs in a given certificate string.
			* We want to look for the contents between the BEGIN and END certificate strings, without the associated newlines.
			* The information in parens "(.+?)" is the capture group to represent the cert we want isolated.
			* "." means any string character, "+" means match 1 or more times, and "?" means the shortest match.
			* The "g" at the end of the regex means search the string globally, and the "s" enables the "." to match newlines.
			*/
			const regexToFindCerts = /-----BEGIN CERTIFICATE-----\r*\n(.+?)\r*\n-----END CERTIFICATE-----/gs;
			const certs = [];
			let matches;
			while ((matches = regexToFindCerts.exec(publicCertificate)) !== null) certs.push(matches[1].replace(/\r*\n/g, ""));
			return certs;
		}
	};
	const name = "@azure/msal-node";
	const version = "7.1.1";
	/**
	* Base application class which will construct requests to send to and handle responses from the Microsoft STS using the authorization code flow.
	* @internal
	*/
	var BaseClient = class {
		constructor(configuration) {
			this.config = buildClientConfiguration(configuration);
			this.logger = new Logger(this.config.loggerOptions, name, version);
			this.cryptoUtils = this.config.cryptoInterface;
			this.cacheManager = this.config.storageInterface;
			this.networkClient = this.config.networkInterface;
			this.serverTelemetryManager = this.config.serverTelemetryManager;
			this.authority = this.config.authOptions.authority;
			this.performanceClient = new StubPerformanceClient();
		}
		/**
		* Creates default headers for requests to token endpoint
		*/
		createTokenRequestHeaders(ccsCred) {
			return createTokenRequestHeaders(this.logger, false, ccsCred);
		}
		/**
		* Http post to token endpoint
		* @param tokenEndpoint
		* @param queryString
		* @param headers
		* @param thumbprint
		*/
		async executePostToTokenEndpoint(tokenEndpoint, queryString, headers, thumbprint, correlationId) {
			return executePostToTokenEndpoint(tokenEndpoint, queryString, headers, thumbprint, correlationId, this.cacheManager, this.networkClient, this.logger, this.performanceClient, this.serverTelemetryManager);
		}
		/**
		* Wraps sendPostRequestAsync with necessary preflight and postflight logic
		* @param thumbprint - Request thumbprint for throttling
		* @param tokenEndpoint - Endpoint to make the POST to
		* @param options - Body and Headers to include on the POST request
		* @param correlationId - CorrelationId for telemetry
		*/
		async sendPostRequest(thumbprint, tokenEndpoint, options, correlationId) {
			return sendPostRequest(thumbprint, tokenEndpoint, options, correlationId, this.cacheManager, this.networkClient, this.logger, this.performanceClient);
		}
		/**
		* Creates query string for the /token request
		* @param request
		*/
		createTokenQueryParameters(request) {
			return createTokenQueryParameters(request, this.config.authOptions.clientId, this.config.authOptions.redirectUri, this.performanceClient);
		}
	};
	/**
	* Oauth2.0 Password grant client
	* Note: We are only supporting public clients for password grant and for purely testing purposes
	* @public
	* @deprecated - Use a more secure flow instead
	*/
	var UsernamePasswordClient = class extends BaseClient {
		constructor(configuration) {
			super(configuration);
		}
		/**
		* API to acquire a token by passing the username and password to the service in exchage of credentials
		* password_grant
		* @param request - CommonUsernamePasswordRequest
		*/
		async acquireToken(request) {
			this.logger.info("in acquireToken call in username-password client", request.correlationId);
			const reqTimestamp = nowSeconds();
			const response = await this.executeTokenRequest(this.authority, request);
			const responseHandler = new ResponseHandler(this.config.authOptions.clientId, this.cacheManager, this.cryptoUtils, this.logger, this.performanceClient, this.config.serializableCache, this.config.persistencePlugin, this.config.tokenBindingKeyManager);
			responseHandler.validateTokenResponse(response.body, request.correlationId);
			return responseHandler.handleServerTokenResponse(response.body, this.authority, reqTimestamp, request, ApiId.acquireTokenByUsernamePassword);
		}
		/**
		* Executes POST request to token endpoint
		* @param authority - authority object
		* @param request - CommonUsernamePasswordRequest provided by the developer
		*/
		async executeTokenRequest(authority, request) {
			const queryParametersString = this.createTokenQueryParameters(request);
			const endpoint = UrlString.appendQueryString(authority.tokenEndpoint, queryParametersString);
			const requestBody = await this.createTokenRequestBody(request);
			const headers = this.createTokenRequestHeaders({
				credential: request.username,
				type: CcsCredentialType.UPN
			});
			const thumbprint = {
				clientId: this.config.authOptions.clientId,
				authority: authority.canonicalAuthority,
				scopes: request.scopes,
				claims: request.claims,
				authenticationScheme: request.authenticationScheme,
				resourceRequestMethod: request.resourceRequestMethod,
				resourceRequestUri: request.resourceRequestUri,
				shrClaims: request.shrClaims,
				sshKid: request.sshKid
			};
			return this.executePostToTokenEndpoint(endpoint, requestBody, headers, thumbprint, request.correlationId);
		}
		/**
		* Generates a map for all the params to be sent to the service
		* @param request - CommonUsernamePasswordRequest provided by the developer
		*/
		async createTokenRequestBody(request) {
			const parameters = /* @__PURE__ */ new Map();
			addClientId(parameters, this.config.authOptions.clientId);
			addUsername(parameters, request.username);
			addPassword(parameters, request.password);
			addScopes(parameters, request.scopes, request.correlationId);
			addResponseType(parameters, OAuthResponseType.IDTOKEN_TOKEN);
			addGrantType(parameters, GrantType.RESOURCE_OWNER_PASSWORD_GRANT);
			addClientInfo(parameters);
			addLibraryInfo(parameters, this.config.libraryInfo);
			addApplicationTelemetry(parameters, this.config.telemetry.application);
			addThrottling(parameters);
			if (this.serverTelemetryManager) addServerTelemetry(parameters, this.serverTelemetryManager);
			addCorrelationId(parameters, request.correlationId || this.config.cryptoInterface.createNewGuid());
			if (this.config.clientCredentials.clientSecret) addClientSecret(parameters, this.config.clientCredentials.clientSecret);
			const clientAssertion = this.config.clientCredentials.clientAssertion;
			if (clientAssertion) {
				addClientAssertion(parameters, await getClientAssertion(clientAssertion.assertion, this.config.authOptions.clientId, request.resourceRequestUri));
				addClientAssertionType(parameters, clientAssertion.assertionType);
			}
			if (!StringUtils.isEmptyObj(request.claims) || this.config.authOptions.clientCapabilities && this.config.authOptions.clientCapabilities.length > 0) addClaims(parameters, request.correlationId, request.claims, this.config.authOptions.clientCapabilities);
			if (this.config.systemOptions.preventCorsPreflight && request.username) addCcsUpn(parameters, request.username);
			return mapToQueryString(parameters);
		}
	};
	/**
	* Constructs the full /authorize URL with request parameters
	* @param config
	* @param authority
	* @param request
	* @param logger
	* @returns
	*/
	function getAuthCodeRequestUrl(config, authority, request, logger) {
		const parameters = getStandardAuthorizeRequestParameters({
			...config.auth,
			authority,
			redirectUri: request.redirectUri || ""
		}, request, logger);
		addLibraryInfo(parameters, {
			sku: Constants.MSAL_SKU,
			version,
			cpu: process.arch || "",
			os: process.platform || ""
		});
		if (config.system.protocolMode !== ProtocolMode.OIDC) addApplicationTelemetry(parameters, config.telemetry.application);
		addResponseType(parameters, OAuthResponseType.CODE);
		if (request.codeChallenge && request.codeChallengeMethod) addCodeChallengeParams(parameters, request.codeChallenge, request.codeChallengeMethod);
		addExtraParameters(parameters, request.extraQueryParameters || {});
		return getAuthorizeUrl(authority, parameters);
	}
	const activeSilentTokenRequests = /* @__PURE__ */ new WeakMap();
	/**
	* Shares an in-flight silent acquisition while preserving each caller's correlation ID.
	*/
	function acquireTokenSilentDeduped(owner, logger, silentRequestKey, correlationId, acquireToken) {
		const existingRequests = activeSilentTokenRequests.get(owner);
		const activeRequests = existingRequests || /* @__PURE__ */ new Map();
		if (!existingRequests) activeSilentTokenRequests.set(owner, activeRequests);
		const inProgressRequest = activeRequests.get(silentRequestKey);
		if (inProgressRequest) {
			logger.verbose("acquireTokenSilent has been called previously, returning the result from the first call", correlationId);
			return applyCallerCorrelationIdToResult(inProgressRequest, correlationId);
		}
		logger.verbose("acquireTokenSilent called for the first time, storing active request", correlationId);
		const activeRequest = Promise.resolve().then(acquireToken).finally(() => {
			activeRequests.delete(silentRequestKey);
			if (activeRequests.size === 0) activeSilentTokenRequests.delete(owner);
		});
		activeRequests.set(silentRequestKey, activeRequest);
		return applyCallerCorrelationIdToResult(activeRequest, correlationId);
	}
	/**
	* Builds the key used to identify equivalent in-progress silent requests.
	*/
	function getSilentRequestKey(input) {
		const { request } = input;
		const authority = input.requestType === "native" ? request.authority : input.authority;
		const commonKeyFields = {
			requestType: input.requestType,
			clientId: input.requestType === "native" ? input.request.clientId : input.clientId,
			authority,
			scopes: canonicalizeRequestValues(request.scopes),
			claims: request.claims,
			authenticationScheme: request.authenticationScheme,
			resourceRequestMethod: request.resourceRequestMethod,
			resourceRequestUri: request.resourceRequestUri,
			forceRefresh: request.forceRefresh,
			redirectUri: request.redirectUri || "",
			resource: request.resource,
			extraParameters: canonicalizeRequestValues(request.extraParameters)
		};
		if (input.requestType === "native") return JSON.stringify({
			...commonKeyFields,
			accountId: input.request.accountId,
			shrNonce: input.request.shrNonce,
			extraScopesToConsent: canonicalizeRequestValues(input.request.extraScopesToConsent),
			loginHint: input.request.loginHint,
			prompt: input.request.prompt
		});
		const nonNativeRequest = input.request;
		const thumbprint = getRequestThumbprint(input.clientId, {
			...nonNativeRequest,
			authority
		}, nonNativeRequest.account.homeAccountId);
		return JSON.stringify({
			...thumbprint,
			...commonKeyFields,
			accountTenantId: nonNativeRequest.account.tenantId,
			accountEnvironment: nonNativeRequest.account.environment,
			refreshTokenExpirationOffsetSeconds: nonNativeRequest.refreshTokenExpirationOffsetSeconds,
			extraQueryParameters: canonicalizeRequestValues(nonNativeRequest.extraQueryParameters),
			skipBrokerClaims: thumbprint.embeddedClientId || nonNativeRequest.extraParameters?.[BROKER_CLIENT_ID] ? nonNativeRequest.skipBrokerClaims : void 0
		});
	}
	/**
	* Copies mutable native request values so execution cannot diverge from the stored key.
	*/
	function snapshotNativeRequest(request) {
		return {
			...request,
			scopes: [...request.scopes],
			extraParameters: request.extraParameters ? { ...request.extraParameters } : void 0,
			extraScopesToConsent: request.extraScopesToConsent ? [...request.extraScopesToConsent] : void 0
		};
	}
	/**
	* Canonicalizes scope sets and request dictionaries without changing the outgoing request.
	*/
	function canonicalizeRequestValues(values) {
		if (Array.isArray(values)) return Array.from(new Set(values.map((scope) => scope.trim()).filter((scope) => scope.length > 0))).sort();
		return values ? Object.keys(values).sort().map((key) => [key, values[key]]) : void 0;
	}
	/**
	* Applies the caller's correlation ID to successful results.
	* Shared failures retain the original error and underlying operation correlation ID.
	*/
	function applyCallerCorrelationIdToResult(activeRequest, correlationId) {
		return activeRequest.then((result) => ({
			...result,
			correlationId
		}));
	}
	/**
	* Base abstract class for all ClientApplications - public and confidential
	* @public
	*/
	var ClientApplication = class {
		/**
		* Constructor for the ClientApplication
		*/
		constructor(configuration) {
			this.config = buildAppConfiguration(configuration);
			this.cryptoProvider = new CryptoProvider();
			this.logger = new Logger(this.config.system.loggerOptions, name, version);
			this.storage = new NodeStorage(this.logger, this.config.auth.clientId, this.cryptoProvider, buildStaticAuthorityOptions(this.config.auth));
			this.tokenCache = new TokenCache(this.storage, this.logger, this.config.cache.cachePlugin);
		}
		/**
		* Creates the URL of the authorization request, letting the user input credentials and consent to the
		* application. The URL targets the /authorize endpoint of the authority configured in the
		* application object.
		*
		* Once the user inputs their credentials and consents, the authority will send a response to the redirect URI
		* sent in the request and should contain an authorization code, which can then be used to acquire tokens via
		* `acquireTokenByCode(AuthorizationCodeRequest)`.
		*/
		async getAuthCodeUrl(request) {
			this.logger.info("getAuthCodeUrl called", request.correlationId || "");
			const validRequest = {
				...request,
				...await this.initializeBaseRequest(request),
				responseMode: request.responseMode || ResponseMode$1.QUERY,
				authenticationScheme: AuthenticationScheme.BEARER,
				state: request.state || "",
				nonce: request.nonce || ""
			};
			const discoveredAuthority = await this.createAuthority(validRequest.authority, validRequest.correlationId, void 0, request.azureCloudOptions);
			return getAuthCodeRequestUrl(this.config, discoveredAuthority, validRequest, this.logger);
		}
		/**
		* Acquires a token by exchanging the Authorization Code received from the first step of OAuth2.0
		* Authorization Code flow.
		*
		* `getAuthCodeUrl(AuthorizationCodeUrlRequest)` can be used to create the URL for the first step of OAuth2.0
		* Authorization Code flow. Ensure that values for redirectUri and scopes in AuthorizationCodeUrlRequest and
		* AuthorizationCodeRequest are the same.
		*/
		async acquireTokenByCode(request, authCodePayLoad) {
			this.logger.info("acquireTokenByCode called", request.correlationId || "");
			let validatedAuthCodePayload = authCodePayLoad;
			if (request.state && validatedAuthCodePayload) {
				this.logger.info("acquireTokenByCode - validating state", request.correlationId || "");
				this.validateState(request.state, validatedAuthCodePayload.state || "", request.correlationId || "");
				validatedAuthCodePayload = {
					...validatedAuthCodePayload,
					state: ""
				};
			}
			const expectedNonce = request.nonce !== void 0 ? request.nonce : validatedAuthCodePayload?.nonce;
			validatedAuthCodePayload = {
				...validatedAuthCodePayload,
				code: request.code,
				nonce: expectedNonce
			};
			const validRequest = {
				...request,
				...await this.initializeBaseRequest(request),
				authenticationScheme: AuthenticationScheme.BEARER
			};
			const serverTelemetryManager = this.initializeServerTelemetryManager(ApiId.acquireTokenByCode, validRequest.correlationId);
			try {
				const discoveredAuthority = await this.createAuthority(validRequest.authority, validRequest.correlationId, void 0, request.azureCloudOptions);
				const authorizationCodeClient = new AuthorizationCodeClient(await this.buildOauthClientConfiguration(discoveredAuthority, validRequest.correlationId, validRequest.redirectUri, serverTelemetryManager), new StubPerformanceClient());
				this.logger.verbose("Auth code client created", validRequest.correlationId);
				return await authorizationCodeClient.acquireToken(validRequest, ApiId.acquireTokenByCode, validatedAuthCodePayload);
			} catch (e) {
				if (e instanceof AuthError) e.correlationId = validRequest.correlationId;
				serverTelemetryManager.cacheFailedRequest(e);
				throw e;
			}
		}
		/**
		* Acquires a token by exchanging the refresh token provided for a new set of tokens.
		*
		* This API is provided only for scenarios where you would like to migrate from ADAL to MSAL. Otherwise, it is
		* recommended that you use `acquireTokenSilent()` for silent scenarios. When using `acquireTokenSilent()`, MSAL will
		* handle the caching and refreshing of tokens automatically.
		*/
		async acquireTokenByRefreshToken(request) {
			this.logger.info("acquireTokenByRefreshToken called", request.correlationId || "");
			const validRequest = {
				...request,
				...await this.initializeBaseRequest(request),
				authenticationScheme: AuthenticationScheme.BEARER
			};
			const serverTelemetryManager = this.initializeServerTelemetryManager(ApiId.acquireTokenByRefreshToken, validRequest.correlationId);
			try {
				const discoveredAuthority = await this.createAuthority(validRequest.authority, validRequest.correlationId, void 0, request.azureCloudOptions);
				const refreshTokenClient = new RefreshTokenClient(await this.buildOauthClientConfiguration(discoveredAuthority, validRequest.correlationId, validRequest.redirectUri || "", serverTelemetryManager), new StubPerformanceClient());
				this.logger.verbose("Refresh token client created", validRequest.correlationId);
				return await refreshTokenClient.acquireToken(validRequest, ApiId.acquireTokenByRefreshToken);
			} catch (e) {
				if (e instanceof AuthError) e.correlationId = validRequest.correlationId;
				serverTelemetryManager.cacheFailedRequest(e);
				throw e;
			}
		}
		/**
		* Acquires a token silently when a user specifies the account the token is requested for.
		*
		* This API expects the user to provide an account object and looks into the cache to retrieve the token if present.
		* There is also an optional "forceRefresh" boolean the user can send to bypass the cache for access_token and id_token.
		* Concurrent requests with the same request thumbprint return the same in-progress result.
		* In case the refresh_token is expired or not found, an error is thrown
		* and the guidance is for the user to call any interactive token acquisition API (eg: `acquireTokenByCode()`).
		*/
		async acquireTokenSilent(request) {
			const validRequest = {
				...request,
				...await this.initializeBaseRequest(request),
				forceRefresh: request.forceRefresh || false
			};
			if (!validRequest.account) return this.acquireTokenSilentAsync(validRequest, request.azureCloudOptions);
			const silentRequestKey = getSilentRequestKey({
				requestType: "non-native",
				request: validRequest,
				authority: Authority.generateAuthority(validRequest.authority, request.azureCloudOptions || this.config.auth.azureCloudOptions),
				clientId: this.config.auth.clientId
			});
			return acquireTokenSilentDeduped(this, this.logger, silentRequestKey, validRequest.correlationId, () => this.acquireTokenSilentAsync(validRequest, request.azureCloudOptions));
		}
		async acquireTokenSilentAsync(validRequest, azureCloudOptions) {
			const serverTelemetryManager = this.initializeServerTelemetryManager(ApiId.acquireTokenSilent, validRequest.correlationId, validRequest.forceRefresh);
			try {
				const discoveredAuthority = await this.createAuthority(validRequest.authority, validRequest.correlationId, void 0, azureCloudOptions);
				const clientConfiguration = await this.buildOauthClientConfiguration(discoveredAuthority, validRequest.correlationId, validRequest.redirectUri || "", serverTelemetryManager);
				const silentFlowClient = new SilentFlowClient(clientConfiguration, new StubPerformanceClient());
				this.logger.verbose("Silent flow client created", validRequest.correlationId);
				try {
					await this.tokenCache.overwriteCache();
					return await this.acquireCachedTokenSilent(validRequest, silentFlowClient, clientConfiguration);
				} catch (error) {
					if (error instanceof ClientAuthError && error.errorCode === tokenRefreshRequired) return new RefreshTokenClient(clientConfiguration, new StubPerformanceClient()).acquireTokenByRefreshToken(validRequest, ApiId.acquireTokenSilent);
					throw error;
				}
			} catch (error) {
				if (error instanceof AuthError) error.correlationId = validRequest.correlationId;
				serverTelemetryManager.cacheFailedRequest(error);
				throw error;
			}
		}
		async acquireCachedTokenSilent(validRequest, silentFlowClient, clientConfiguration) {
			const [authResponse, cacheOutcome] = await silentFlowClient.acquireCachedToken({
				...validRequest,
				scopes: validRequest.scopes?.length ? validRequest.scopes : [...OIDC_DEFAULT_SCOPES]
			});
			if (cacheOutcome === CacheOutcome.PROACTIVELY_REFRESHED) {
				this.logger.info("ClientApplication:acquireCachedTokenSilent - Cached access token's refreshOn property has been exceeded'. It's not expired, but must be refreshed.", validRequest.correlationId);
				const refreshTokenClient = new RefreshTokenClient(clientConfiguration, new StubPerformanceClient());
				try {
					await refreshTokenClient.acquireTokenByRefreshToken(validRequest, ApiId.acquireTokenSilent);
				} catch {}
			}
			return authResponse;
		}
		/**
		* Acquires tokens with password grant by exchanging client applications username and password for credentials
		*
		* The latest OAuth 2.0 Security Best Current Practice disallows the password grant entirely.
		* More details on this recommendation at https://tools.ietf.org/html/draft-ietf-oauth-security-topics-13#section-3.4
		* Microsoft's documentation and recommendations are at:
		* https://docs.microsoft.com/en-us/azure/active-directory/develop/msal-authentication-flows#usernamepassword
		*
		* @param request - UsenamePasswordRequest
		* @deprecated - Use a more secure flow instead
		*/
		async acquireTokenByUsernamePassword(request) {
			this.logger.info("acquireTokenByUsernamePassword called", request.correlationId || "");
			const validRequest = {
				...request,
				...await this.initializeBaseRequest(request)
			};
			const serverTelemetryManager = this.initializeServerTelemetryManager(ApiId.acquireTokenByUsernamePassword, validRequest.correlationId);
			try {
				const discoveredAuthority = await this.createAuthority(validRequest.authority, validRequest.correlationId, void 0, request.azureCloudOptions);
				const usernamePasswordClient = new UsernamePasswordClient(await this.buildOauthClientConfiguration(discoveredAuthority, validRequest.correlationId, "", serverTelemetryManager));
				this.logger.verbose("Username password client created", validRequest.correlationId);
				return await usernamePasswordClient.acquireToken(validRequest);
			} catch (e) {
				if (e instanceof AuthError) e.correlationId = validRequest.correlationId;
				serverTelemetryManager.cacheFailedRequest(e);
				throw e;
			}
		}
		/**
		* Gets the token cache for the application.
		*/
		getTokenCache() {
			this.logger.info("getTokenCache called", "");
			return this.tokenCache;
		}
		/**
		* Validates OIDC state by comparing the user cached state with the state received from the server.
		*
		* This API is provided for scenarios where you would use OAuth2.0 state parameter to mitigate against
		* CSRF attacks.
		* For more information about state, visit https://datatracker.ietf.org/doc/html/rfc6819#section-3.6.
		* @param state - Unique GUID generated by the user that is cached by the user and sent to the server during the first leg of the flow
		* @param cachedState - This string is sent back by the server with the authorization code
		*/
		validateState(state, cachedState, correlationId) {
			if (!state) throw NodeAuthError.createStateNotFoundError(correlationId);
			if (state !== cachedState) throw createClientAuthError(stateMismatch, correlationId);
		}
		/**
		* Returns the logger instance
		*/
		getLogger() {
			return this.logger;
		}
		/**
		* Replaces the default logger set in configurations with new Logger with new configurations
		* @param logger - Logger instance
		*/
		setLogger(logger) {
			this.logger = logger;
		}
		/**
		* Builds the common configuration to be passed to the common component based on the platform configurarion
		* @param authority - user passed authority in configuration
		* @param serverTelemetryManager - initializes servertelemetry if passed
		*/
		async buildOauthClientConfiguration(discoveredAuthority, requestCorrelationId, redirectUri, serverTelemetryManager) {
			this.logger.verbose("buildOauthClientConfiguration called", requestCorrelationId);
			this.logger.info(`Building oauth client configuration with the following authority: ${discoveredAuthority.tokenEndpoint}.`, requestCorrelationId);
			serverTelemetryManager?.updateRegionDiscoveryMetadata(discoveredAuthority.regionDiscoveryMetadata);
			return {
				authOptions: {
					clientId: this.config.auth.clientId,
					authority: discoveredAuthority,
					clientCapabilities: this.config.auth.clientCapabilities,
					redirectUri,
					isMcp: this.config.auth.isMcp
				},
				loggerOptions: {
					logLevel: this.config.system.loggerOptions.logLevel,
					loggerCallback: this.config.system.loggerOptions.loggerCallback,
					piiLoggingEnabled: this.config.system.loggerOptions.piiLoggingEnabled,
					correlationId: requestCorrelationId
				},
				cryptoInterface: this.cryptoProvider,
				networkInterface: this.config.system.networkClient,
				storageInterface: this.storage,
				serverTelemetryManager,
				clientCredentials: {
					clientSecret: this.clientSecret,
					clientAssertion: await this.getClientAssertion(discoveredAuthority)
				},
				libraryInfo: {
					sku: Constants.MSAL_SKU,
					version,
					cpu: process.arch || "",
					os: process.platform || ""
				},
				telemetry: this.config.telemetry,
				persistencePlugin: this.config.cache.cachePlugin,
				serializableCache: this.tokenCache
			};
		}
		async getClientAssertion(authority) {
			if (this.developerProvidedClientAssertion) this.clientAssertion = ClientAssertion.fromAssertion(await getClientAssertion(this.developerProvidedClientAssertion, this.config.auth.clientId, authority.tokenEndpoint));
			return this.clientAssertion && {
				assertion: this.clientAssertion.getJwt(this.cryptoProvider, this.config.auth.clientId, authority.tokenEndpoint),
				assertionType: Constants.JWT_BEARER_ASSERTION_TYPE
			};
		}
		/**
		* Generates a request with the default scopes & generates a correlationId.
		* @param authRequest - BaseAuthRequest for initialization
		*/
		async initializeBaseRequest(authRequest) {
			const correlationId = authRequest.correlationId || this.cryptoProvider.createNewGuid();
			this.logger.verbose("initializeRequestScopes called", correlationId);
			if (authRequest.authenticationScheme && authRequest.authenticationScheme === AuthenticationScheme.POP) this.logger.verbose("Authentication Scheme 'pop' is not supported yet, setting Authentication Scheme to 'Bearer' for request", correlationId);
			authRequest.authenticationScheme = AuthenticationScheme.BEARER;
			return {
				...authRequest,
				scopes: [...authRequest && authRequest.scopes || [], ...OIDC_DEFAULT_SCOPES],
				correlationId,
				authority: authRequest.authority || this.config.auth.authority
			};
		}
		/**
		* Initializes the server telemetry payload
		* @param apiId - Id for a specific request
		* @param correlationId - GUID
		* @param forceRefresh - boolean to indicate network call
		*/
		initializeServerTelemetryManager(apiId, correlationId, forceRefresh) {
			return new ServerTelemetryManager({
				clientId: this.config.auth.clientId,
				correlationId,
				apiId,
				forceRefresh: forceRefresh || false
			}, this.storage);
		}
		/**
		* Create authority instance. If authority not passed in request, default to authority set on the application
		* object. If no authority set in application object, then default to common authority.
		* @param authorityString - authority from user configuration
		*/
		async createAuthority(authorityString, requestCorrelationId, azureRegionConfiguration, azureCloudOptions) {
			this.logger.verbose("createAuthority called", requestCorrelationId);
			const authorityUrl = Authority.generateAuthority(authorityString, azureCloudOptions || this.config.auth.azureCloudOptions);
			const authorityOptions = {
				protocolMode: this.config.system.protocolMode,
				knownAuthorities: this.config.auth.knownAuthorities,
				cloudDiscoveryMetadata: this.config.auth.cloudDiscoveryMetadata,
				authorityMetadata: this.config.auth.authorityMetadata,
				azureRegionConfiguration
			};
			return createDiscoveredInstance(authorityUrl, this.config.system.networkClient, this.storage, authorityOptions, this.logger, requestCorrelationId, new StubPerformanceClient());
		}
		/**
		* Clear the cache except for authority metadata.
		*/
		clearCache() {
			this.storage.clear();
		}
	};
	var LoopbackClient = class {
		constructor(preferredPort) {
			this.preferredPort = preferredPort;
		}
		/**
		* Spins up a loopback server which returns the server response when the localhost redirectUri is hit
		* @param successTemplate
		* @param errorTemplate
		* @returns
		*/
		async listenForAuthCode(successTemplate, errorTemplate) {
			if (this.server) throw NodeAuthError.createLoopbackServerAlreadyExistsError();
			return new Promise((resolve, reject) => {
				this.server = http.createServer((req, res) => {
					const method = req.method?.toUpperCase();
					if (method !== "GET" && method !== "POST") {
						res.writeHead(405, { Allow: "GET, POST" });
						res.end("Method Not Allowed");
						return;
					}
					const url = req.url;
					if (!url) {
						res.end(errorTemplate || "Error occurred loading redirectUrl");
						reject(NodeAuthError.createUnableToLoadRedirectUrlError());
						return;
					} else if (url === FORWARD_SLASH) {
						if (method === "POST") {
							this.handlePostRequest(req, res, resolve, successTemplate, errorTemplate);
							return;
						}
						res.end(successTemplate || "Auth code was successfully acquired. You can close this window now.");
						return;
					}
					if (method === "GET") {
						const redirectUri = this.getRedirectUri();
						const authCodeResponse = getDeserializedResponse(new URL(url, redirectUri).search) || {};
						if (!authCodeResponse.code && !authCodeResponse.error) {
							res.writeHead(200);
							res.end();
							return;
						}
						res.writeHead(400);
						res.end("OAuth responses must use form_post and cannot be returned in the URL.");
						reject(NodeAuthError.createLoopbackServerQueryResponseNotSupportedError());
					} else {
						res.writeHead(200);
						res.end();
					}
				});
				const port = this.preferredPort || 0;
				this.server.on("error", (err) => {
					if (err.code === "EADDRINUSE" && this.preferredPort && port !== 0) this.server?.listen(0, "127.0.0.1");
					else reject(err);
				});
				this.server.listen(port, "127.0.0.1");
			});
		}
		/**
		* Handles POST requests for form_post response mode
		*/
		handlePostRequest(req, res, resolve, successTemplate, errorTemplate) {
			if (req.headers["content-type"]?.split(";")[0]?.trim() !== "application/x-www-form-urlencoded") {
				res.writeHead(415);
				res.end("Unsupported Media Type");
				return;
			}
			let body = "";
			req.on("error", () => {
				if (!res.headersSent) res.writeHead(400);
				res.end();
			});
			req.on("data", (chunk) => {
				body += chunk.toString();
			});
			req.on("end", () => {
				const authCodeResponse = getDeserializedResponse(`?${body}`) || {};
				if (!authCodeResponse.code && !authCodeResponse.error) {
					res.writeHead(200);
					res.end();
					return;
				}
				if (authCodeResponse.error) {
					res.writeHead(200);
					res.end(errorTemplate || `Error occurred: ${authCodeResponse.error}`);
				} else {
					res.writeHead(200);
					res.end(successTemplate || "Auth code was successfully acquired. You can close this window now.");
				}
				resolve(authCodeResponse);
			});
		}
		/**
		* Get the port that the loopback server is running on
		* @returns
		*/
		getRedirectUri() {
			if (!this.server || !this.server.listening) throw NodeAuthError.createNoLoopbackServerExistsError();
			const address = this.server.address();
			if (!address || typeof address === "string" || !address.port) {
				this.closeServer();
				throw NodeAuthError.createInvalidLoopbackAddressTypeError();
			}
			const port = address && address.port;
			return `${Constants.HTTP_PROTOCOL}${Constants.LOCALHOST}:${port}`;
		}
		/**
		* Close the loopback server
		*/
		closeServer() {
			if (this.server) {
				this.server.close();
				if (typeof this.server.closeAllConnections === "function") this.server.closeAllConnections();
				this.server.unref();
				this.server = void 0;
			}
		}
	};
	/**
	* OAuth2.0 Device code client
	* @public
	*/
	var DeviceCodeClient = class extends BaseClient {
		constructor(configuration) {
			super(configuration);
		}
		/**
		* Gets device code from device code endpoint, calls back to with device code response, and
		* polls token endpoint to exchange device code for tokens
		* @param request - developer provided CommonDeviceCodeRequest
		*/
		async acquireToken(request) {
			const deviceCodeResponse = await this.getDeviceCode(request);
			request.deviceCodeCallback(deviceCodeResponse);
			const reqTimestamp = nowSeconds();
			const response = await this.acquireTokenWithDeviceCode(request, deviceCodeResponse);
			const responseHandler = new ResponseHandler(this.config.authOptions.clientId, this.cacheManager, this.cryptoUtils, this.logger, this.performanceClient, this.config.serializableCache, this.config.persistencePlugin, this.config.tokenBindingKeyManager);
			responseHandler.validateTokenResponse(response, request.correlationId);
			return responseHandler.handleServerTokenResponse(response, this.authority, reqTimestamp, request, ApiId.acquireTokenByDeviceCode);
		}
		/**
		* Creates device code request and executes http GET
		* @param request - developer provided CommonDeviceCodeRequest
		*/
		async getDeviceCode(request) {
			const queryParametersString = this.createExtraQueryParameters(request);
			const endpoint = UrlString.appendQueryString(this.authority.deviceCodeEndpoint, queryParametersString);
			const queryString = this.createQueryString(request);
			const headers = this.createTokenRequestHeaders();
			const thumbprint = {
				clientId: this.config.authOptions.clientId,
				authority: request.authority,
				scopes: request.scopes,
				claims: request.claims,
				authenticationScheme: request.authenticationScheme,
				resourceRequestMethod: request.resourceRequestMethod,
				resourceRequestUri: request.resourceRequestUri,
				shrClaims: request.shrClaims,
				sshKid: request.sshKid
			};
			return this.executePostRequestToDeviceCodeEndpoint(endpoint, queryString, headers, thumbprint, request.correlationId);
		}
		/**
		* Creates query string for the device code request
		* @param request - developer provided CommonDeviceCodeRequest
		*/
		createExtraQueryParameters(request) {
			const parameters = /* @__PURE__ */ new Map();
			if (request.extraQueryParameters) addExtraParameters(parameters, request.extraQueryParameters);
			return mapToQueryString(parameters);
		}
		/**
		* Executes POST request to device code endpoint
		* @param deviceCodeEndpoint - token endpoint
		* @param queryString - string to be used in the body of the request
		* @param headers - headers for the request
		* @param thumbprint - unique request thumbprint
		* @param correlationId - correlation id to be used in the request
		*/
		async executePostRequestToDeviceCodeEndpoint(deviceCodeEndpoint, queryString, headers, thumbprint, correlationId) {
			const { body: { user_code: userCode, device_code: deviceCode, verification_uri: verificationUri, expires_in: expiresIn, interval, message } } = await this.sendPostRequest(thumbprint, deviceCodeEndpoint, {
				body: queryString,
				headers
			}, correlationId);
			return {
				userCode,
				deviceCode,
				verificationUri,
				expiresIn,
				interval,
				message
			};
		}
		/**
		* Create device code endpoint query parameters and returns string
		* @param request - developer provided CommonDeviceCodeRequest
		*/
		createQueryString(request) {
			const parameters = /* @__PURE__ */ new Map();
			addScopes(parameters, request.scopes, request.correlationId);
			addClientId(parameters, this.config.authOptions.clientId);
			if (request.extraQueryParameters) addExtraParameters(parameters, request.extraQueryParameters);
			if (request.claims || this.config.authOptions.clientCapabilities && this.config.authOptions.clientCapabilities.length > 0) addClaims(parameters, request.correlationId, request.claims, this.config.authOptions.clientCapabilities);
			return mapToQueryString(parameters);
		}
		/**
		* Breaks the polling with specific conditions
		* @param deviceCodeExpirationTime - expiration time for the device code request
		* @param correlationId - correlation id of the request
		* @param userSpecifiedTimeout - developer provided timeout, to be compared against deviceCodeExpirationTime
		* @param userSpecifiedCancelFlag - boolean indicating the developer would like to cancel the request
		*/
		continuePolling(deviceCodeExpirationTime, correlationId, userSpecifiedTimeout, userSpecifiedCancelFlag) {
			if (userSpecifiedCancelFlag) {
				this.logger.error("Token request cancelled by setting DeviceCodeRequest.cancel = true", correlationId);
				throw createClientAuthError(deviceCodePollingCancelled, correlationId);
			} else if (userSpecifiedTimeout && userSpecifiedTimeout < deviceCodeExpirationTime && nowSeconds() > userSpecifiedTimeout) {
				this.logger.error(`User defined timeout for device code polling reached. The timeout was set for ${userSpecifiedTimeout}`, correlationId);
				throw createClientAuthError(userTimeoutReached, correlationId);
			} else if (nowSeconds() > deviceCodeExpirationTime) {
				if (userSpecifiedTimeout) this.logger.verbose(`User specified timeout ignored as the device code has expired before the timeout elapsed. The user specified timeout was set for ${userSpecifiedTimeout}`, correlationId);
				this.logger.error(`Device code expired. Expiration time of device code was ${deviceCodeExpirationTime}`, correlationId);
				throw createClientAuthError(deviceCodeExpired, correlationId);
			}
			return true;
		}
		/**
		* Creates token request with device code response and polls token endpoint at interval set by the device code response
		* @param request - developer provided CommonDeviceCodeRequest
		* @param deviceCodeResponse - DeviceCodeResponse returned by the security token service device code endpoint
		*/
		async acquireTokenWithDeviceCode(request, deviceCodeResponse) {
			const queryParametersString = this.createTokenQueryParameters(request);
			const endpoint = UrlString.appendQueryString(this.authority.tokenEndpoint, queryParametersString);
			const requestBody = this.createTokenRequestBody(request, deviceCodeResponse);
			const headers = this.createTokenRequestHeaders();
			const userSpecifiedTimeout = request.timeout ? nowSeconds() + request.timeout : void 0;
			const deviceCodeExpirationTime = nowSeconds() + deviceCodeResponse.expiresIn;
			const pollingIntervalMilli = deviceCodeResponse.interval * 1e3;
			while (this.continuePolling(deviceCodeExpirationTime, request.correlationId, userSpecifiedTimeout, request.cancel)) {
				const thumbprint = {
					clientId: this.config.authOptions.clientId,
					authority: request.authority,
					scopes: request.scopes,
					claims: request.claims,
					authenticationScheme: request.authenticationScheme,
					resourceRequestMethod: request.resourceRequestMethod,
					resourceRequestUri: request.resourceRequestUri,
					shrClaims: request.shrClaims,
					sshKid: request.sshKid
				};
				const response = await this.executePostToTokenEndpoint(endpoint, requestBody, headers, thumbprint, request.correlationId);
				if (response.body && response.body.error) if (response.body.error === AUTHORIZATION_PENDING) {
					this.logger.info("Authorization pending. Continue polling.", request.correlationId);
					await delay(pollingIntervalMilli);
				} else {
					this.logger.info("Unexpected error in polling from the server", request.correlationId);
					throw createAuthError(postRequestFailed, request.correlationId, response.body.error);
				}
				else {
					this.logger.verbose("Authorization completed successfully. Polling stopped.", request.correlationId);
					return response.body;
				}
			}
			this.logger.error("Polling stopped for unknown reasons.", request.correlationId);
			throw createClientAuthError(deviceCodeUnknownError, request.correlationId);
		}
		/**
		* Creates query parameters and converts to string.
		* @param request - developer provided CommonDeviceCodeRequest
		* @param deviceCodeResponse - DeviceCodeResponse returned by the security token service device code endpoint
		*/
		createTokenRequestBody(request, deviceCodeResponse) {
			const parameters = /* @__PURE__ */ new Map();
			addScopes(parameters, request.scopes, request.correlationId);
			addClientId(parameters, this.config.authOptions.clientId);
			addGrantType(parameters, GrantType.DEVICE_CODE_GRANT);
			addDeviceCode(parameters, deviceCodeResponse.deviceCode);
			addCorrelationId(parameters, request.correlationId || this.config.cryptoInterface.createNewGuid());
			addClientInfo(parameters);
			addLibraryInfo(parameters, this.config.libraryInfo);
			addApplicationTelemetry(parameters, this.config.telemetry.application);
			addThrottling(parameters);
			if (this.serverTelemetryManager) addServerTelemetry(parameters, this.serverTelemetryManager);
			if (!StringUtils.isEmptyObj(request.claims) || this.config.authOptions.clientCapabilities && this.config.authOptions.clientCapabilities.length > 0) addClaims(parameters, request.correlationId, request.claims, this.config.authOptions.clientCapabilities);
			return mapToQueryString(parameters);
		}
	};
	/**
	* This class is to be used to acquire tokens for public client applications (desktop, mobile). Public client applications
	* are not trusted to safely store application secrets, and therefore can only request tokens in the name of an user.
	* @public
	*/
	var PublicClientApplication = class extends ClientApplication {
		/**
		* Important attributes in the Configuration object for auth are:
		* - clientID: the application ID of your application. You can obtain one by registering your application with our Application registration portal.
		* - authority: the authority URL for your application.
		*
		* AAD authorities are of the form https://login.microsoftonline.com/\{Enter_the_Tenant_Info_Here\}.
		* - If your application supports Accounts in one organizational directory, replace "Enter_the_Tenant_Info_Here" value with the Tenant Id or Tenant name (for example, contoso.microsoft.com).
		* - If your application supports Accounts in any organizational directory, replace "Enter_the_Tenant_Info_Here" value with organizations.
		* - If your application supports Accounts in any organizational directory and personal Microsoft accounts, replace "Enter_the_Tenant_Info_Here" value with common.
		* - To restrict support to Personal Microsoft accounts only, replace "Enter_the_Tenant_Info_Here" value with consumers.
		*
		* Azure B2C authorities are of the form https://\{instance\}/\{tenant\}/\{policy\}. Each policy is considered
		* its own authority. You will have to set the all of the knownAuthorities at the time of the client application
		* construction.
		*
		* ADFS authorities are of the form https://\{instance\}/adfs.
		*/
		constructor(configuration) {
			super(configuration);
			if (this.config.broker.nativeBrokerPlugin) if (this.config.broker.nativeBrokerPlugin.isBrokerAvailable) {
				this.nativeBrokerPlugin = this.config.broker.nativeBrokerPlugin;
				this.nativeBrokerPlugin.setLogger(this.config.system.loggerOptions);
			} else this.logger.warning("NativeBroker implementation was provided but the broker is unavailable.", "");
			this.skus = ServerTelemetryManager.makeExtraSkuString({
				libraryName: Constants.MSAL_SKU,
				libraryVersion: version
			});
		}
		/**
		* Acquires a token from the authority using OAuth2.0 device code flow.
		* This flow is designed for devices that do not have access to a browser or have input constraints.
		* The authorization server issues a DeviceCode object with a verification code, an end-user code,
		* and the end-user verification URI. The DeviceCode object is provided through a callback, and the end-user should be
		* instructed to use another device to navigate to the verification URI to input credentials.
		* Since the client cannot receive incoming requests, it polls the authorization server repeatedly
		* until the end-user completes input of credentials.
		*/
		async acquireTokenByDeviceCode(request) {
			this.logger.info("acquireTokenByDeviceCode called", request.correlationId || "");
			enforceResourceParameter(this.config.auth.isMcp, request);
			const validRequest = Object.assign(request, await this.initializeBaseRequest(request));
			const serverTelemetryManager = this.initializeServerTelemetryManager(ApiId.acquireTokenByDeviceCode, validRequest.correlationId);
			try {
				const discoveredAuthority = await this.createAuthority(validRequest.authority, validRequest.correlationId, void 0, request.azureCloudOptions);
				const deviceCodeClient = new DeviceCodeClient(await this.buildOauthClientConfiguration(discoveredAuthority, validRequest.correlationId, "", serverTelemetryManager));
				this.logger.verbose("Device code client created", validRequest.correlationId);
				return await deviceCodeClient.acquireToken(validRequest);
			} catch (e) {
				if (e instanceof AuthError) e.correlationId = validRequest.correlationId;
				serverTelemetryManager.cacheFailedRequest(e);
				throw e;
			}
		}
		/**
		* Acquires a token interactively via the browser by requesting an authorization code then exchanging it for a token.
		*/
		async acquireTokenInteractive(request) {
			const correlationId = request.correlationId || this.cryptoProvider.createNewGuid();
			this.logger.trace("acquireTokenInteractive called", correlationId);
			enforceResourceParameter(this.config.auth.isMcp, request);
			const { openBrowser, successTemplate, errorTemplate, windowHandle, preferredPort, ...remainingProperties } = request;
			if (this.nativeBrokerPlugin) {
				const brokerRequest = {
					...remainingProperties,
					clientId: this.config.auth.clientId,
					scopes: request.scopes || OIDC_DEFAULT_SCOPES,
					redirectUri: request.redirectUri || "",
					authority: request.authority || this.config.auth.authority,
					correlationId,
					extraParameters: {
						...remainingProperties.extraQueryParameters,
						...remainingProperties.extraParameters,
						[X_CLIENT_EXTRA_SKU]: this.skus
					},
					accountId: remainingProperties.account?.nativeAccountId
				};
				return this.nativeBrokerPlugin.acquireTokenInteractive(brokerRequest, windowHandle);
			}
			if (request.redirectUri) {
				if (!this.config.broker.nativeBrokerPlugin) throw NodeAuthError.createRedirectUriNotSupportedError(correlationId);
				request.redirectUri = "";
			}
			const { verifier, challenge } = await this.cryptoProvider.generatePkceCodes();
			const loopbackClient = new LoopbackClient(preferredPort);
			const responseMode = remainingProperties.responseMode;
			if (responseMode !== void 0 && responseMode !== ResponseMode$1.FORM_POST) throw createClientConfigurationError(invalidResponseMode, correlationId);
			let authCodeResponse = {};
			let authCodeListenerError = null;
			try {
				const authCodeListener = loopbackClient.listenForAuthCode(successTemplate, errorTemplate).then((response) => {
					authCodeResponse = response;
				}).catch((e) => {
					authCodeListenerError = e;
				});
				const redirectUri = await this.waitForRedirectUri(loopbackClient, correlationId);
				const validRequest = {
					...remainingProperties,
					correlationId,
					scopes: request.scopes || OIDC_DEFAULT_SCOPES,
					redirectUri,
					responseMode: ResponseMode$1.FORM_POST,
					codeChallenge: challenge,
					codeChallengeMethod: CodeChallengeMethodValues.S256
				};
				await openBrowser(await this.getAuthCodeUrl(validRequest));
				await authCodeListener;
				if (authCodeListenerError) throw authCodeListenerError;
				if (authCodeResponse.error) throw new ServerError(authCodeResponse.error, correlationId, authCodeResponse.error_description, authCodeResponse.suberror);
				else if (!authCodeResponse.code) throw NodeAuthError.createNoAuthCodeInResponseError(correlationId);
				const clientInfo = authCodeResponse.client_info;
				const tokenRequest = {
					code: authCodeResponse.code,
					codeVerifier: verifier,
					clientInfo: clientInfo || "",
					...validRequest
				};
				return await this.acquireTokenByCode(tokenRequest);
			} finally {
				loopbackClient.closeServer();
			}
		}
		/**
		* Returns a token retrieved either from the cache or by exchanging the refresh token for a fresh access token. If brokering is enabled the token request will be serviced by the broker.
		* @param request - developer provided SilentFlowRequest
		* @returns
		*/
		async acquireTokenSilent(request) {
			const correlationId = request.correlationId || this.cryptoProvider.createNewGuid();
			this.logger.trace("acquireTokenSilent called", correlationId);
			enforceResourceParameter(this.config.auth.isMcp, request);
			if (this.nativeBrokerPlugin) {
				const nativeBrokerPlugin = this.nativeBrokerPlugin;
				const brokerRequest = snapshotNativeRequest({
					...request,
					clientId: this.config.auth.clientId,
					scopes: request.scopes || OIDC_DEFAULT_SCOPES,
					redirectUri: request.redirectUri || "",
					authority: request.authority || this.config.auth.authority,
					correlationId,
					extraParameters: {
						...request.extraQueryParameters,
						...request.extraParameters,
						[X_CLIENT_EXTRA_SKU]: this.skus
					},
					accountId: request.account.nativeAccountId,
					forceRefresh: request.forceRefresh || false
				});
				const silentRequestKey = getSilentRequestKey({
					requestType: "native",
					request: brokerRequest
				});
				return acquireTokenSilentDeduped(this, this.logger, silentRequestKey, correlationId, () => nativeBrokerPlugin.acquireTokenSilent(brokerRequest));
			}
			if (request.redirectUri) {
				if (!this.config.broker.nativeBrokerPlugin) throw NodeAuthError.createRedirectUriNotSupportedError(correlationId);
				request.redirectUri = "";
			}
			return super.acquireTokenSilent(request);
		}
		/**
		* Acquires a token by exchanging the authorization code received from the first step of OAuth 2.0 Authorization Code Flow.
		* In MCP mode, a resource parameter is required on the request.
		*/
		async acquireTokenByCode(request, authCodePayLoad) {
			enforceResourceParameter(this.config.auth.isMcp, request);
			return super.acquireTokenByCode(request, authCodePayLoad);
		}
		/**
		* Acquires a token by exchanging the refresh token provided for a new set of tokens.
		* In MCP mode, a resource parameter is required on the request.
		*/
		async acquireTokenByRefreshToken(request) {
			enforceResourceParameter(this.config.auth.isMcp, request);
			return super.acquireTokenByRefreshToken(request);
		}
		/**
		* Removes cache artifacts associated with the given account
		* @param request - developer provided SignOutRequest
		* @returns
		*/
		async signOut(request) {
			if (this.nativeBrokerPlugin && request.account.nativeAccountId) {
				const signoutRequest = {
					clientId: this.config.auth.clientId,
					accountId: request.account.nativeAccountId,
					correlationId: request.correlationId || this.cryptoProvider.createNewGuid()
				};
				await this.nativeBrokerPlugin.signOut(signoutRequest);
			}
			await this.getTokenCache().removeAccount(request.account, request.correlationId);
		}
		/**
		* Returns all cached accounts for this application. If brokering is enabled this request will be serviced by the broker.
		* @returns
		*/
		async getAllAccounts() {
			if (this.nativeBrokerPlugin) {
				const correlationId = this.cryptoProvider.createNewGuid();
				return this.nativeBrokerPlugin.getAllAccounts(this.config.auth.clientId, correlationId);
			}
			return this.getTokenCache().getAllAccounts();
		}
		/**
		* Attempts to retrieve the redirectUri from the loopback server. If the loopback server does not start listening for requests within the timeout this will throw.
		* @param loopbackClient - built-in loopback server implementation
		* @param correlationId - correlation id of the request
		* @returns
		*/
		async waitForRedirectUri(loopbackClient, correlationId) {
			return new Promise((resolve, reject) => {
				let ticks = 0;
				const id = setInterval(() => {
					if (LOOPBACK_SERVER_CONSTANTS.TIMEOUT_MS / LOOPBACK_SERVER_CONSTANTS.INTERVAL_MS < ticks) {
						clearInterval(id);
						reject(NodeAuthError.createLoopbackServerTimeoutError(correlationId));
						return;
					}
					try {
						const r = loopbackClient.getRedirectUri();
						clearInterval(id);
						resolve(r);
						return;
					} catch (e) {
						if (e instanceof AuthError && e.errorCode === NodeAuthErrorMessage.noLoopbackServerExists.code) {
							ticks++;
							return;
						}
						clearInterval(id);
						reject(e);
						return;
					}
				}, LOOPBACK_SERVER_CONSTANTS.INTERVAL_MS);
			});
		}
	};
	/**
	* OAuth2.0 client credential grant
	* @public
	*/
	var ClientCredentialClient = class extends BaseClient {
		constructor(configuration, appTokenProvider) {
			super(configuration);
			this.appTokenProvider = appTokenProvider;
		}
		/**
		* Public API to acquire a token with ClientCredential Flow for Confidential clients
		* @param request - CommonClientCredentialRequest provided by the developer
		*/
		async acquireToken(request) {
			let additionalCacheKeyComponents;
			if (request.fmiPath) additionalCacheKeyComponents = {
				...additionalCacheKeyComponents,
				fmi_path: request.fmiPath
			};
			if (request.claimsFromClient && !StringUtils.isEmptyObj(request.claimsFromClient)) additionalCacheKeyComponents = {
				...additionalCacheKeyComponents,
				client_claims: request.claimsFromClient
			};
			if (request.skipCache || !StringUtils.isEmptyObj(request.claims)) return this.executeTokenRequest(request, this.authority, void 0, additionalCacheKeyComponents);
			const [cachedAuthenticationResult, lastCacheOutcome] = await this.getCachedAuthenticationResult(request, this.config, this.cryptoUtils, this.authority, this.cacheManager, this.serverTelemetryManager, additionalCacheKeyComponents);
			if (cachedAuthenticationResult) {
				if (lastCacheOutcome === CacheOutcome.PROACTIVELY_REFRESHED) {
					this.logger.info("ClientCredentialClient:getCachedAuthenticationResult - Cached access token's refreshOn property has been exceeded'. It's not expired, but must be refreshed.", request.correlationId);
					await this.executeTokenRequest(request, this.authority, true, additionalCacheKeyComponents);
				}
				return cachedAuthenticationResult;
			} else return this.executeTokenRequest(request, this.authority, void 0, additionalCacheKeyComponents);
		}
		/**
		* looks up cache if the tokens are cached already
		*/
		async getCachedAuthenticationResult(request, config, cryptoUtils, authority, cacheManager, serverTelemetryManager, additionalCacheKeyComponents) {
			const clientConfiguration = config;
			const managedIdentityConfiguration = config;
			let lastCacheOutcome = CacheOutcome.NOT_APPLICABLE;
			let cacheContext;
			if (clientConfiguration.serializableCache && clientConfiguration.persistencePlugin) {
				cacheContext = new TokenCacheContext(clientConfiguration.serializableCache, false);
				await clientConfiguration.persistencePlugin.beforeCacheAccess(cacheContext);
			}
			const cachedAccessToken = this.readAccessTokenFromCache(authority, managedIdentityConfiguration.managedIdentityId?.id || clientConfiguration.authOptions.clientId, new ScopeSet(request.scopes || [], request.correlationId), cacheManager, request.correlationId, additionalCacheKeyComponents);
			if (clientConfiguration.serializableCache && clientConfiguration.persistencePlugin && cacheContext) await clientConfiguration.persistencePlugin.afterCacheAccess(cacheContext);
			if (!cachedAccessToken) {
				serverTelemetryManager?.setCacheOutcome(CacheOutcome.NO_CACHED_ACCESS_TOKEN);
				return [null, CacheOutcome.NO_CACHED_ACCESS_TOKEN];
			}
			if (isTokenExpired(cachedAccessToken.expiresOn, clientConfiguration.systemOptions?.tokenRenewalOffsetSeconds || DEFAULT_TOKEN_RENEWAL_OFFSET_SEC)) {
				serverTelemetryManager?.setCacheOutcome(CacheOutcome.CACHED_ACCESS_TOKEN_EXPIRED);
				return [null, CacheOutcome.CACHED_ACCESS_TOKEN_EXPIRED];
			}
			if (cachedAccessToken.refreshOn && isTokenExpired(cachedAccessToken.refreshOn.toString(), 0)) {
				lastCacheOutcome = CacheOutcome.PROACTIVELY_REFRESHED;
				serverTelemetryManager?.setCacheOutcome(CacheOutcome.PROACTIVELY_REFRESHED);
			}
			return [await ResponseHandler.generateAuthenticationResult(cryptoUtils, authority, {
				account: null,
				idToken: null,
				accessToken: cachedAccessToken,
				refreshToken: null,
				appMetadata: null
			}, true, request, this.performanceClient, { tokenBindingKeyManager: this.config.tokenBindingKeyManager }), lastCacheOutcome];
		}
		/**
		* Reads access token from the cache
		*/
		readAccessTokenFromCache(authority, id, scopeSet, cacheManager, correlationId, additionalCacheKeyComponents) {
			const accessTokenFilter = {
				homeAccountId: "",
				environment: authority.canonicalAuthorityUrlComponents.HostNameAndPort,
				credentialType: CredentialType.ACCESS_TOKEN,
				clientId: id,
				realm: authority.tenant,
				target: ScopeSet.createSearchScopes(scopeSet.asArray(), correlationId),
				additionalCacheKeyComponents
			};
			const accessTokens = cacheManager.getAccessTokensByFilter(accessTokenFilter, correlationId);
			if (accessTokens.length < 1) return null;
			else if (accessTokens.length > 1) throw createClientAuthError(multipleMatchingTokens, correlationId);
			return accessTokens[0];
		}
		/**
		* Makes a network call to request the token from the service
		* @param request - CommonClientCredentialRequest provided by the developer
		* @param authority - authority object
		*/
		async executeTokenRequest(request, authority, refreshAccessToken, additionalCacheKeyComponents) {
			let serverTokenResponse;
			let reqTimestamp;
			if (this.appTokenProvider) {
				this.logger.info("Using appTokenProvider extensibility.", request.correlationId);
				const appTokenPropviderParameters = {
					correlationId: request.correlationId,
					tenantId: this.config.authOptions.authority.tenant,
					scopes: request.scopes,
					claims: request.claims
				};
				reqTimestamp = nowSeconds();
				const appTokenProviderResult = await this.appTokenProvider(appTokenPropviderParameters);
				serverTokenResponse = {
					access_token: appTokenProviderResult.accessToken,
					expires_in: appTokenProviderResult.expiresInSeconds,
					refresh_in: appTokenProviderResult.refreshInSeconds,
					token_type: AuthenticationScheme.BEARER
				};
			} else {
				const queryParametersString = this.createTokenQueryParameters(request);
				const endpoint = UrlString.appendQueryString(authority.tokenEndpoint, queryParametersString);
				const requestBody = await this.createTokenRequestBody(request);
				const headers = this.createTokenRequestHeaders();
				const thumbprint = {
					clientId: this.config.authOptions.clientId,
					authority: request.authority,
					scopes: request.scopes,
					claims: request.claims,
					authenticationScheme: request.authenticationScheme,
					resourceRequestMethod: request.resourceRequestMethod,
					resourceRequestUri: request.resourceRequestUri,
					shrClaims: request.shrClaims,
					sshKid: request.sshKid
				};
				this.logger.info("Sending token request to endpoint: " + authority.tokenEndpoint, request.correlationId);
				reqTimestamp = nowSeconds();
				const response = await this.executePostToTokenEndpoint(endpoint, requestBody, headers, thumbprint, request.correlationId);
				serverTokenResponse = response.body;
				serverTokenResponse.status = response.status;
			}
			const responseHandler = new ResponseHandler(this.config.authOptions.clientId, this.cacheManager, this.cryptoUtils, this.logger, this.performanceClient, this.config.serializableCache, this.config.persistencePlugin, this.config.tokenBindingKeyManager);
			responseHandler.validateTokenResponse(serverTokenResponse, request.correlationId, refreshAccessToken);
			return await responseHandler.handleServerTokenResponse(serverTokenResponse, this.authority, reqTimestamp, request, ApiId.acquireTokenByClientCredential, void 0, void 0, void 0, void 0, void 0, additionalCacheKeyComponents);
		}
		/**
		* generate the request to the server in the acceptable format
		* @param request - CommonClientCredentialRequest provided by the developer
		*/
		async createTokenRequestBody(request) {
			const parameters = /* @__PURE__ */ new Map();
			addClientId(parameters, this.config.authOptions.clientId);
			addScopes(parameters, request.scopes, request.correlationId, false);
			addGrantType(parameters, GrantType.CLIENT_CREDENTIALS_GRANT);
			addLibraryInfo(parameters, this.config.libraryInfo);
			addApplicationTelemetry(parameters, this.config.telemetry.application);
			addThrottling(parameters);
			if (this.serverTelemetryManager) addServerTelemetry(parameters, this.serverTelemetryManager);
			addCorrelationId(parameters, request.correlationId || this.config.cryptoInterface.createNewGuid());
			if (this.config.clientCredentials.clientSecret) addClientSecret(parameters, this.config.clientCredentials.clientSecret);
			const clientAssertion = request.clientAssertion || this.config.clientCredentials.clientAssertion;
			if (clientAssertion) {
				addClientAssertion(parameters, await getClientAssertion(clientAssertion.assertion, this.config.authOptions.clientId, this.authority.tokenEndpoint, request.fmiPath));
				addClientAssertionType(parameters, clientAssertion.assertionType);
			}
			if (request.fmiPath) parameters.set(FMI_PATH, request.fmiPath);
			if (!StringUtils.isEmptyObj(request.claims) || !StringUtils.isEmptyObj(request.claimsFromClient) || this.config.authOptions.clientCapabilities && this.config.authOptions.clientCapabilities.length > 0) addClaims(parameters, request.correlationId, request.claims, this.config.authOptions.clientCapabilities, void 0, request.claimsFromClient);
			return mapToQueryString(parameters);
		}
	};
	/**
	* On-Behalf-Of client
	* @public
	*/
	var OnBehalfOfClient = class extends BaseClient {
		constructor(configuration) {
			super(configuration);
		}
		/**
		* Public API to acquire tokens with on behalf of flow
		* @param request - developer provided CommonOnBehalfOfRequest
		*/
		async acquireToken(request) {
			this.scopeSet = new ScopeSet(request.scopes || [], request.correlationId);
			this.userAssertionHash = await this.cryptoUtils.hashString(request.oboAssertion);
			let additionalCacheKeyComponents;
			if (request.claimsFromClient && !StringUtils.isEmptyObj(request.claimsFromClient)) additionalCacheKeyComponents = { client_claims: request.claimsFromClient };
			if (request.skipCache || !StringUtils.isEmptyObj(request.claims)) return this.executeTokenRequest(request, this.authority, this.userAssertionHash, additionalCacheKeyComponents);
			try {
				return await this.getCachedAuthenticationResult(request, additionalCacheKeyComponents);
			} catch (e) {
				return await this.executeTokenRequest(request, this.authority, this.userAssertionHash, additionalCacheKeyComponents);
			}
		}
		/**
		* look up cache for tokens
		* Find idtoken in the cache
		* Find accessToken based on user assertion and account info in the cache
		* Please note we are not yet supported OBO tokens refreshed with long lived RT. User will have to send a new assertion if the current access token expires
		* This is to prevent security issues when the assertion changes over time, however, longlived RT helps retaining the session
		* @param request - developer provided CommonOnBehalfOfRequest
		*/
		async getCachedAuthenticationResult(request, additionalCacheKeyComponents) {
			const cachedAccessToken = this.readAccessTokenFromCacheForOBO(this.config.authOptions.clientId, request, additionalCacheKeyComponents);
			if (!cachedAccessToken) {
				this.serverTelemetryManager?.setCacheOutcome(CacheOutcome.NO_CACHED_ACCESS_TOKEN);
				this.logger.info("SilentFlowClient:acquireCachedToken - No access token found in cache for the given properties.", request.correlationId);
				throw createClientAuthError(tokenRefreshRequired, request.correlationId);
			} else if (isTokenExpired(cachedAccessToken.expiresOn, this.config.systemOptions.tokenRenewalOffsetSeconds)) {
				this.serverTelemetryManager?.setCacheOutcome(CacheOutcome.CACHED_ACCESS_TOKEN_EXPIRED);
				this.logger.info(`OnbehalfofFlow:getCachedAuthenticationResult - Cached access token is expired or will expire within ${this.config.systemOptions.tokenRenewalOffsetSeconds} seconds.`, request.correlationId);
				throw createClientAuthError(tokenRefreshRequired, request.correlationId);
			}
			const cachedIdToken = this.readIdTokenFromCacheForOBO(cachedAccessToken.homeAccountId, request.correlationId);
			let idTokenClaims;
			let cachedAccount = null;
			if (cachedIdToken) {
				idTokenClaims = extractTokenClaims(cachedIdToken.secret, EncodingUtils.base64Decode, request.correlationId);
				const localAccountId = idTokenClaims.oid || idTokenClaims.sub;
				const accountInfo = {
					homeAccountId: cachedIdToken.homeAccountId,
					environment: cachedIdToken.environment,
					tenantId: cachedIdToken.realm,
					username: "",
					localAccountId: localAccountId || ""
				};
				cachedAccount = this.cacheManager.getAccount(this.cacheManager.generateAccountKey(accountInfo), request.correlationId);
			}
			if (this.config.serverTelemetryManager) this.config.serverTelemetryManager.incrementCacheHits();
			return ResponseHandler.generateAuthenticationResult(this.cryptoUtils, this.authority, {
				account: cachedAccount,
				accessToken: cachedAccessToken,
				idToken: cachedIdToken,
				refreshToken: null,
				appMetadata: null
			}, true, request, this.performanceClient, {
				idTokenClaims,
				tokenBindingKeyManager: this.config.tokenBindingKeyManager
			});
		}
		/**
		* read idtoken from cache, this is a specific implementation for OBO as the requirements differ from a generic lookup in the cacheManager
		* Certain use cases of OBO flow do not expect an idToken in the cache/or from the service
		* @param atHomeAccountId - account id
		*/
		readIdTokenFromCacheForOBO(atHomeAccountId, correlationId) {
			const idTokenFilter = {
				homeAccountId: atHomeAccountId,
				environment: this.authority.canonicalAuthorityUrlComponents.HostNameAndPort,
				credentialType: CredentialType.ID_TOKEN,
				clientId: this.config.authOptions.clientId,
				realm: this.authority.tenant
			};
			const idTokenMap = this.cacheManager.getIdTokensByFilter(idTokenFilter, correlationId);
			if (Object.values(idTokenMap).length < 1) return null;
			return Object.values(idTokenMap)[0];
		}
		/**
		* Fetches the cached access token based on incoming assertion
		* @param clientId - client id
		* @param request - developer provided CommonOnBehalfOfRequest
		*/
		readAccessTokenFromCacheForOBO(clientId, request, additionalCacheKeyComponents) {
			const authScheme = request.authenticationScheme || AuthenticationScheme.BEARER;
			const accessTokenFilter = {
				credentialType: authScheme.toLowerCase() !== AuthenticationScheme.BEARER.toLowerCase() ? CredentialType.ACCESS_TOKEN_WITH_AUTH_SCHEME : CredentialType.ACCESS_TOKEN,
				clientId,
				target: ScopeSet.createSearchScopes(this.scopeSet.asArray(), request.correlationId),
				tokenType: authScheme,
				keyId: request.sshKid,
				userAssertionHash: this.userAssertionHash,
				additionalCacheKeyComponents
			};
			const accessTokens = this.cacheManager.getAccessTokensByFilter(accessTokenFilter, request.correlationId);
			const numAccessTokens = accessTokens.length;
			if (numAccessTokens < 1) return null;
			else if (numAccessTokens > 1) throw createClientAuthError(multipleMatchingTokens, request.correlationId);
			return accessTokens[0];
		}
		/**
		* Make a network call to the server requesting credentials
		* @param request - developer provided CommonOnBehalfOfRequest
		* @param authority - authority object
		*/
		async executeTokenRequest(request, authority, userAssertionHash, additionalCacheKeyComponents) {
			const queryParametersString = this.createTokenQueryParameters(request);
			const endpoint = UrlString.appendQueryString(authority.tokenEndpoint, queryParametersString);
			const requestBody = await this.createTokenRequestBody(request);
			const headers = this.createTokenRequestHeaders();
			const thumbprint = {
				clientId: this.config.authOptions.clientId,
				authority: request.authority,
				scopes: request.scopes,
				claims: request.claims,
				authenticationScheme: request.authenticationScheme,
				resourceRequestMethod: request.resourceRequestMethod,
				resourceRequestUri: request.resourceRequestUri,
				shrClaims: request.shrClaims,
				sshKid: request.sshKid
			};
			const reqTimestamp = nowSeconds();
			const response = await this.executePostToTokenEndpoint(endpoint, requestBody, headers, thumbprint, request.correlationId);
			const responseHandler = new ResponseHandler(this.config.authOptions.clientId, this.cacheManager, this.cryptoUtils, this.logger, this.performanceClient, this.config.serializableCache, this.config.persistencePlugin, this.config.tokenBindingKeyManager);
			responseHandler.validateTokenResponse(response.body, request.correlationId);
			return await responseHandler.handleServerTokenResponse(response.body, this.authority, reqTimestamp, request, ApiId.acquireTokenByOBO, void 0, userAssertionHash, void 0, void 0, void 0, additionalCacheKeyComponents);
		}
		/**
		* generate a server request in accepable format
		* @param request - developer provided CommonOnBehalfOfRequest
		*/
		async createTokenRequestBody(request) {
			const parameters = /* @__PURE__ */ new Map();
			addClientId(parameters, this.config.authOptions.clientId);
			addScopes(parameters, request.scopes, request.correlationId);
			addGrantType(parameters, GrantType.JWT_BEARER);
			addClientInfo(parameters);
			addLibraryInfo(parameters, this.config.libraryInfo);
			addApplicationTelemetry(parameters, this.config.telemetry.application);
			addThrottling(parameters);
			if (this.serverTelemetryManager) addServerTelemetry(parameters, this.serverTelemetryManager);
			addCorrelationId(parameters, request.correlationId || this.config.cryptoInterface.createNewGuid());
			addRequestTokenUse(parameters, ON_BEHALF_OF);
			addOboAssertion(parameters, request.oboAssertion);
			if (this.config.clientCredentials.clientSecret) addClientSecret(parameters, this.config.clientCredentials.clientSecret);
			const clientAssertion = this.config.clientCredentials.clientAssertion;
			if (clientAssertion) {
				addClientAssertion(parameters, await getClientAssertion(clientAssertion.assertion, this.config.authOptions.clientId, request.resourceRequestUri));
				addClientAssertionType(parameters, clientAssertion.assertionType);
			}
			if (!StringUtils.isEmptyObj(request.claims) || !StringUtils.isEmptyObj(request.claimsFromClient) || this.config.authOptions.clientCapabilities && this.config.authOptions.clientCapabilities.length > 0) addClaims(parameters, request.correlationId, request.claims, this.config.authOptions.clientCapabilities, void 0, request.claimsFromClient);
			return mapToQueryString(parameters);
		}
	};
	/**
	* Client for the user_fic grant type (Leg 3 of Agent Identity).
	* Exchanges a federated identity credential (instance token) for a user-scoped token.
	* @internal
	*/
	var UserFederatedIdentityCredentialClient = class extends BaseClient {
		constructor(configuration) {
			super(configuration);
		}
		/**
		* Acquires a token using the user_fic grant type.
		* Always hits the network (no cache lookup for the network call).
		* Developers use acquireTokenSilent for cached FIC tokens.
		*/
		async acquireToken(request) {
			return this.executeTokenRequest(request, this.authority);
		}
		/**
		* Makes a network call to the token endpoint
		*/
		async executeTokenRequest(request, authority) {
			const scopeSet = new ScopeSet(request.scopes || [], request.correlationId);
			scopeSet.appendScopes(OIDC_DEFAULT_SCOPES);
			const augmentedScopes = scopeSet.asArray();
			const queryParametersString = this.createTokenQueryParameters(request);
			const endpoint = UrlString.appendQueryString(authority.tokenEndpoint, queryParametersString);
			const requestBody = await this.createTokenRequestBody(request, augmentedScopes);
			const headers = this.createTokenRequestHeaders();
			const thumbprint = {
				clientId: this.config.authOptions.clientId,
				authority: request.authority,
				scopes: augmentedScopes,
				claims: request.claims,
				authenticationScheme: request.authenticationScheme,
				resourceRequestMethod: request.resourceRequestMethod,
				resourceRequestUri: request.resourceRequestUri,
				shrClaims: request.shrClaims,
				sshKid: request.sshKid
			};
			const reqTimestamp = nowSeconds();
			const response = await this.executePostToTokenEndpoint(endpoint, requestBody, headers, thumbprint, request.correlationId);
			const responseHandler = new ResponseHandler(this.config.authOptions.clientId, this.cacheManager, this.cryptoUtils, this.logger, this.performanceClient, this.config.serializableCache, this.config.persistencePlugin, this.config.tokenBindingKeyManager);
			responseHandler.validateTokenResponse(response.body, request.correlationId);
			return await responseHandler.handleServerTokenResponse(response.body, this.authority, reqTimestamp, request, ApiId.acquireTokenByUserFederatedIdentityCredential);
		}
		/**
		* Builds the request body for the user_fic grant type
		*/
		async createTokenRequestBody(request, augmentedScopes) {
			const parameters = /* @__PURE__ */ new Map();
			addClientId(parameters, this.config.authOptions.clientId);
			addScopes(parameters, augmentedScopes, request.correlationId);
			addGrantType(parameters, GrantType.USER_FIC);
			addClientInfo(parameters);
			parameters.set(USER_FEDERATED_IDENTITY_CREDENTIAL, request.assertion);
			if (request.username) parameters.set(USERNAME, request.username);
			else if (request.userObjectId) parameters.set(USER_ID, request.userObjectId);
			addLibraryInfo(parameters, this.config.libraryInfo);
			addApplicationTelemetry(parameters, this.config.telemetry.application);
			addThrottling(parameters);
			if (this.serverTelemetryManager) addServerTelemetry(parameters, this.serverTelemetryManager);
			addCorrelationId(parameters, request.correlationId || this.config.cryptoInterface.createNewGuid());
			if (this.config.clientCredentials.clientSecret) addClientSecret(parameters, this.config.clientCredentials.clientSecret);
			const clientAssertion = request.clientAssertion || this.config.clientCredentials.clientAssertion;
			if (clientAssertion) {
				addClientAssertion(parameters, await getClientAssertion(clientAssertion.assertion, this.config.authOptions.clientId, this.authority.tokenEndpoint));
				addClientAssertionType(parameters, clientAssertion.assertionType);
			}
			if (!StringUtils.isEmptyObj(request.claims) || !StringUtils.isEmptyObj(request.claimsFromClient) || this.config.authOptions.clientCapabilities && this.config.authOptions.clientCapabilities.length > 0) addClaims(parameters, request.correlationId, request.claims, this.config.authOptions.clientCapabilities, void 0, request.claimsFromClient);
			return mapToQueryString(parameters);
		}
	};
	/**
	*  This class is to be used to acquire tokens for confidential client applications (webApp, webAPI). Confidential client applications
	*  will configure application secrets, client certificates/assertions as applicable
	* @public
	*/
	var ConfidentialClientApplication = class extends ClientApplication {
		/**
		* Constructor for the ConfidentialClientApplication
		*
		* Required attributes in the Configuration object are:
		* - clientID: the application ID of your application. You can obtain one by registering your application with our application registration portal
		* - authority: the authority URL for your application.
		* - client credential: Must set either client secret, certificate, or assertion for confidential clients. You can obtain a client secret from the application registration portal.
		*
		* In Azure AD, authority is a URL indicating of the form https://login.microsoftonline.com/\{Enter_the_Tenant_Info_Here\}.
		* If your application supports Accounts in one organizational directory, replace "Enter_the_Tenant_Info_Here" value with the Tenant Id or Tenant name (for example, contoso.microsoft.com).
		* If your application supports Accounts in any organizational directory, replace "Enter_the_Tenant_Info_Here" value with organizations.
		* If your application supports Accounts in any organizational directory and personal Microsoft accounts, replace "Enter_the_Tenant_Info_Here" value with common.
		* To restrict support to Personal Microsoft accounts only, replace "Enter_the_Tenant_Info_Here" value with consumers.
		*
		* In Azure B2C, authority is of the form https://\{instance\}/tfp/\{tenant\}/\{policyName\}/
		* Full B2C functionality will be available in this library in future versions.
		*
		* @param Configuration - configuration object for the MSAL ConfidentialClientApplication instance
		*/
		constructor(configuration) {
			if ("instanceAware" in configuration.auth && configuration.auth.instanceAware === true) throw NodeAuthError.createUnsupportedCcaInstanceAwareError();
			super(configuration);
			const clientSecretNotEmpty = !!this.config.auth.clientSecret;
			const clientAssertionNotEmpty = !!this.config.auth.clientAssertion;
			const certificateNotEmpty = (!!this.config.auth.clientCertificate?.thumbprint || !!this.config.auth.clientCertificate?.thumbprintSha256) && !!this.config.auth.clientCertificate?.privateKey;
			if (this.appTokenProvider) return;
			if (clientSecretNotEmpty && clientAssertionNotEmpty || clientAssertionNotEmpty && certificateNotEmpty || clientSecretNotEmpty && certificateNotEmpty) throw createClientAuthError(invalidClientCredential, "");
			if (this.config.auth.clientSecret) {
				this.clientSecret = this.config.auth.clientSecret;
				return;
			}
			if (this.config.auth.clientAssertion) {
				this.developerProvidedClientAssertion = this.config.auth.clientAssertion;
				return;
			}
			if (!certificateNotEmpty) throw createClientAuthError(invalidClientCredential, "");
			else this.clientAssertion = !!this.config.auth.clientCertificate.thumbprintSha256 ? ClientAssertion.fromCertificateWithSha256Thumbprint(this.config.auth.clientCertificate.thumbprintSha256, this.config.auth.clientCertificate.privateKey, this.config.auth.clientCertificate.x5c) : ClientAssertion.fromCertificate(this.config.auth.clientCertificate.thumbprint, this.config.auth.clientCertificate.privateKey, this.config.auth.clientCertificate.x5c);
			this.appTokenProvider = void 0;
		}
		/**
		* Creates the URL of the authorization request.
		*/
		async getAuthCodeUrl(request) {
			if (request.extraQueryParameters && Object.prototype.hasOwnProperty.call(request.extraQueryParameters, "instance_aware")) throw NodeAuthError.createUnsupportedCcaInstanceAwareError(request.correlationId);
			return super.getAuthCodeUrl(request);
		}
		/**
		* Acquires a token by exchanging an authorization code.
		*/
		async acquireTokenByCode(request, authCodePayload) {
			const sanitizedAuthCodePayload = authCodePayload ? {
				code: request.code,
				state: authCodePayload.state,
				nonce: request.nonce
			} : void 0;
			return super.acquireTokenByCode(request, sanitizedAuthCodePayload);
		}
		/**
		* This extensibility point only works for the client_credential flow, i.e. acquireTokenByClientCredential and
		* is meant for Azure SDK to enhance Managed Identity support.
		*
		* @param IAppTokenProvider  - Extensibility interface, which allows the app developer to return a token from a custom source.
		*/
		SetAppTokenProvider(provider) {
			this.appTokenProvider = provider;
		}
		/**
		* Acquires tokens from the authority for the application (not for an end user).
		*/
		async acquireTokenByClientCredential(request) {
			this.logger.info("acquireTokenByClientCredential called", request.correlationId || "");
			let clientAssertion;
			if (request.clientAssertion) clientAssertion = {
				assertion: await getClientAssertion(request.clientAssertion, this.config.auth.clientId),
				assertionType: Constants.JWT_BEARER_ASSERTION_TYPE
			};
			const baseRequest = await this.initializeBaseRequest(request);
			const validBaseRequest = {
				...baseRequest,
				scopes: baseRequest.scopes.filter((scope) => !OIDC_DEFAULT_SCOPES.includes(scope))
			};
			const validRequest = {
				...request,
				...validBaseRequest,
				clientAssertion
			};
			const tenantId = new UrlString(validRequest.authority, validRequest.correlationId).getUrlComponents().PathSegments[0];
			if (Object.values(AADAuthority).includes(tenantId)) throw createClientAuthError(missingTenantIdError, validRequest.correlationId);
			const ENV_MSAL_FORCE_REGION = process.env[MSAL_FORCE_REGION];
			let region;
			if (validRequest.azureRegion !== "DisableMsalForceRegion") if (!validRequest.azureRegion && ENV_MSAL_FORCE_REGION) region = ENV_MSAL_FORCE_REGION;
			else region = validRequest.azureRegion;
			const azureRegionConfiguration = {
				azureRegion: region,
				environmentRegion: process.env[REGION_ENVIRONMENT_VARIABLE]
			};
			const serverTelemetryManager = this.initializeServerTelemetryManager(ApiId.acquireTokenByClientCredential, validRequest.correlationId, validRequest.skipCache);
			try {
				const discoveredAuthority = await this.createAuthority(validRequest.authority, validRequest.correlationId, azureRegionConfiguration, request.azureCloudOptions);
				const clientCredentialClient = new ClientCredentialClient(await this.buildOauthClientConfiguration(discoveredAuthority, validRequest.correlationId, "", serverTelemetryManager), this.appTokenProvider);
				this.logger.verbose("Client credential client created", validRequest.correlationId);
				return await clientCredentialClient.acquireToken(validRequest);
			} catch (e) {
				if (e instanceof AuthError) e.correlationId = validRequest.correlationId;
				serverTelemetryManager.cacheFailedRequest(e);
				throw e;
			}
		}
		/**
		* Acquires tokens from the authority for the application.
		*
		* Used in scenarios where the current app is a middle-tier service which was called with a token
		* representing an end user. The current app can use the token (oboAssertion) to request another
		* token to access downstream web API, on behalf of that user.
		*
		* The current middle-tier app has no user interaction to obtain consent.
		* See how to gain consent upfront for your middle-tier app from this article.
		* https://docs.microsoft.com/en-us/azure/active-directory/develop/v2-oauth2-on-behalf-of-flow#gaining-consent-for-the-middle-tier-application
		*/
		async acquireTokenOnBehalfOf(request) {
			this.logger.info("acquireTokenOnBehalfOf called", request.correlationId || "");
			const validRequest = {
				...request,
				...await this.initializeBaseRequest(request)
			};
			try {
				const discoveredAuthority = await this.createAuthority(validRequest.authority, validRequest.correlationId, void 0, request.azureCloudOptions);
				const oboClient = new OnBehalfOfClient(await this.buildOauthClientConfiguration(discoveredAuthority, validRequest.correlationId, "", void 0));
				this.logger.verbose("On behalf of client created", validRequest.correlationId);
				return await oboClient.acquireToken(validRequest);
			} catch (e) {
				if (e instanceof AuthError) e.correlationId = validRequest.correlationId;
				throw e;
			}
		}
		/**
		* Acquires a user-scoped token using the user_fic grant type (Leg 3 of Agent Identity).
		*
		* Exchanges a federated identity credential (instance token from Leg 2) for a user-scoped token.
		* Exactly one of `userObjectId` or `username` must be provided to identify the target user.
		*
		* This method always makes a network call. Use `acquireTokenSilent` to retrieve cached FIC tokens.
		*/
		async acquireTokenByUserFederatedIdentityCredential(request) {
			this.logger.info("acquireTokenByUserFederatedIdentityCredential called", request.correlationId || "");
			if (request.userObjectId && request.username) throw createClientAuthError(conflictingUserIdentifiers, request.correlationId || "");
			if (!request.userObjectId && !request.username) throw createClientAuthError(missingUserIdentifier, request.correlationId || "");
			if (!request.assertion) throw createClientAuthError(emptyFicAssertion, request.correlationId || "");
			let clientAssertion;
			if (request.clientAssertion) clientAssertion = {
				assertion: await getClientAssertion(request.clientAssertion, this.config.auth.clientId),
				assertionType: Constants.JWT_BEARER_ASSERTION_TYPE
			};
			const baseRequest = await this.initializeBaseRequest(request);
			const validRequest = {
				...request,
				...baseRequest,
				assertion: request.assertion,
				clientAssertion
			};
			const serverTelemetryManager = this.initializeServerTelemetryManager(ApiId.acquireTokenByUserFederatedIdentityCredential, validRequest.correlationId);
			try {
				const discoveredAuthority = await this.createAuthority(validRequest.authority, validRequest.correlationId, void 0, request.azureCloudOptions);
				const ficClient = new UserFederatedIdentityCredentialClient(await this.buildOauthClientConfiguration(discoveredAuthority, validRequest.correlationId, "", serverTelemetryManager));
				this.logger.verbose("UserFederatedIdentityCredential client created", validRequest.correlationId);
				return await ficClient.acquireToken(validRequest);
			} catch (e) {
				if (e instanceof AuthError) e.correlationId = validRequest.correlationId;
				serverTelemetryManager.cacheFailedRequest(e);
				throw e;
			}
		}
	};
	/**
	* @internal
	* Checks if a given date string is in ISO 8601 format.
	*
	* @param dateString - The date string to be checked.
	* @returns boolean - Returns true if the date string is in ISO 8601 format, otherwise false.
	*/
	function isIso8601(dateString) {
		if (typeof dateString !== "string") return false;
		const date = new Date(dateString);
		return !isNaN(date.getTime()) && date.toISOString() === dateString;
	}
	var HttpClientWithRetries = class {
		constructor(httpClientNoRetries, retryPolicy, logger) {
			this.httpClientNoRetries = httpClientNoRetries;
			this.retryPolicy = retryPolicy;
			this.logger = logger;
		}
		async sendNetworkRequestAsyncHelper(httpMethod, url, options) {
			if (httpMethod === HttpMethod.GET) return this.httpClientNoRetries.sendGetRequestAsync(url, options);
			else return this.httpClientNoRetries.sendPostRequestAsync(url, options);
		}
		async sendNetworkRequestAsync(httpMethod, url, options) {
			let response = await this.sendNetworkRequestAsyncHelper(httpMethod, url, options);
			if ("isNewRequest" in this.retryPolicy) this.retryPolicy.isNewRequest = true;
			let currentRetry = 0;
			while (await this.retryPolicy.pauseForRetry(response.status, currentRetry, this.logger, response.headers[HeaderNames.RETRY_AFTER])) {
				response = await this.sendNetworkRequestAsyncHelper(httpMethod, url, options);
				currentRetry++;
			}
			return response;
		}
		async sendGetRequestAsync(url, options) {
			return this.sendNetworkRequestAsync(HttpMethod.GET, url, options);
		}
		async sendPostRequestAsync(url, options) {
			return this.sendNetworkRequestAsync(HttpMethod.POST, url, options);
		}
	};
	/**
	* Managed Identity User Assigned Id Query Parameter Names
	*/
	const ManagedIdentityUserAssignedIdQueryParameterNames = {
		MANAGED_IDENTITY_CLIENT_ID_2017: "clientid",
		MANAGED_IDENTITY_CLIENT_ID: "client_id",
		MANAGED_IDENTITY_OBJECT_ID: "object_id",
		MANAGED_IDENTITY_RESOURCE_ID_IMDS: "msi_res_id",
		MANAGED_IDENTITY_RESOURCE_ID_NON_IMDS: "mi_res_id"
	};
	/**
	* Base class for all Managed Identity sources. Provides common functionality for
	* authenticating with Azure Managed Identity endpoints across different Azure services
	* including IMDS, App Service, Azure Arc, Service Fabric, Cloud Shell, and Machine Learning.
	*
	* This abstract class handles token acquisition, response processing, and network communication
	* while allowing concrete implementations to define source-specific request creation logic.
	*/
	var BaseManagedIdentitySource = class {
		/**
		* Creates an instance of BaseManagedIdentitySource.
		*
		* @param logger - Logger instance for diagnostic information
		* @param nodeStorage - Storage interface for caching tokens
		* @param networkClient - Network client for making HTTP requests
		* @param cryptoProvider - Cryptographic provider for token operations
		* @param disableInternalRetries - Whether to disable automatic retry logic
		*/
		constructor(logger, nodeStorage, networkClient, cryptoProvider, disableInternalRetries) {
			this.logger = logger;
			this.nodeStorage = nodeStorage;
			this.networkClient = networkClient;
			this.cryptoProvider = cryptoProvider;
			this.disableInternalRetries = disableInternalRetries;
		}
		/**
		* Generates a new correlation ID for request tracing.
		*
		* @returns A new GUID string for use as a correlation or request ID
		*/
		createCorrelationId() {
			return this.cryptoProvider.createNewGuid();
		}
		/**
		* Processes the network response and converts it to a standardized server token response.
		* This async version allows for source-specific response processing logic while maintaining
		* backward compatibility with the synchronous version.
		*
		* @param response - The network response containing the managed identity token
		* @param _networkClient - Network client used for the request (unused in base implementation)
		* @param _networkRequest - The original network request parameters (unused in base implementation)
		* @param _networkRequestOptions - The network request options (unused in base implementation)
		*
		* @returns Promise resolving to a standardized server authorization token response
		*/
		async getServerTokenResponseAsync(response, _networkClient, _networkRequest, _networkRequestOptions) {
			return this.getServerTokenResponse(response);
		}
		/**
		* Converts a managed identity token response to a standardized server authorization token response.
		* Handles time format conversion, expiration calculation, and error mapping to ensure
		* compatibility with the MSAL response handling pipeline.
		*
		* @param response - The network response containing the managed identity token
		*
		* @returns Standardized server authorization token response with normalized fields
		*/
		getServerTokenResponse(response) {
			let refreshIn, expiresIn;
			if (response.body.expires_on) {
				if (isIso8601(response.body.expires_on)) response.body.expires_on = new Date(response.body.expires_on).getTime() / 1e3;
				expiresIn = response.body.expires_on - nowSeconds();
				if (expiresIn > 2 * 3600) refreshIn = expiresIn / 2;
			}
			return {
				status: response.status,
				access_token: response.body.access_token,
				expires_in: expiresIn,
				scope: response.body.resource,
				token_type: response.body.token_type,
				refresh_in: refreshIn,
				correlation_id: response.body.correlation_id || response.body.correlationId,
				error: typeof response.body.error === "string" ? response.body.error : response.body.error?.code,
				error_description: response.body.message || (typeof response.body.error === "string" ? response.body.error_description : response.body.error?.message),
				error_codes: response.body.error_codes,
				timestamp: response.body.timestamp,
				trace_id: response.body.trace_id
			};
		}
		/**
		* Acquires an access token using the managed identity endpoint for the specified resource.
		* This is the primary method for token acquisition, handling the complete flow from
		* request creation through response processing and token caching.
		*
		* @param managedIdentityRequest - The managed identity request containing resource and optional parameters
		* @param managedIdentityId - The managed identity configuration (system or user-assigned)
		* @param fakeAuthority - Authority instance used for token caching (managed identity uses a placeholder authority)
		* @param refreshAccessToken - Whether this is a token refresh operation
		*
		* @returns Promise resolving to an authentication result containing the access token and metadata
		*
		* @throws {AuthError} When network requests fail or token validation fails
		* @throws {ClientAuthError} When network errors occur during the request
		*/
		async acquireTokenWithManagedIdentity(managedIdentityRequest, managedIdentityId, fakeAuthority, refreshAccessToken) {
			const networkRequest = this.createRequest(managedIdentityRequest.resource, managedIdentityId);
			if (managedIdentityRequest.revokedTokenSha256Hash) {
				this.logger.info(`[Managed Identity] The following claims are present in the request: ${managedIdentityRequest.claims}`, "");
				networkRequest.queryParameters[ManagedIdentityQueryParameters.SHA256_TOKEN_TO_REFRESH] = managedIdentityRequest.revokedTokenSha256Hash;
			}
			if (managedIdentityRequest.clientCapabilities?.length) {
				const clientCapabilities = managedIdentityRequest.clientCapabilities.toString();
				this.logger.info(`[Managed Identity] The following client capabilities are present in the request: ${clientCapabilities}`, "");
				networkRequest.queryParameters[ManagedIdentityQueryParameters.XMS_CC] = clientCapabilities;
			}
			const headers = networkRequest.headers;
			headers[HeaderNames.CONTENT_TYPE] = URL_FORM_CONTENT_TYPE;
			const networkRequestOptions = { headers };
			if (Object.keys(networkRequest.bodyParameters).length) networkRequestOptions.body = networkRequest.computeParametersBodyString();
			/**
			* Initializes the network client helper based on the retry policy configuration.
			* If internal retries are disabled, it uses the provided network client directly.
			* Otherwise, it wraps the network client with an HTTP client that supports retries.
			*/
			const networkClientHelper = this.disableInternalRetries ? this.networkClient : new HttpClientWithRetries(this.networkClient, networkRequest.retryPolicy, this.logger);
			const reqTimestamp = nowSeconds();
			let response;
			try {
				if (networkRequest.httpMethod === HttpMethod.POST) response = await networkClientHelper.sendPostRequestAsync(networkRequest.computeUri(), networkRequestOptions);
				else response = await networkClientHelper.sendGetRequestAsync(networkRequest.computeUri(), networkRequestOptions);
			} catch (error) {
				if (error instanceof AuthError) throw error;
				else throw createClientAuthError(networkError, managedIdentityRequest.correlationId);
			}
			const responseHandler = new ResponseHandler(managedIdentityId.id, this.nodeStorage, this.cryptoProvider, this.logger, new StubPerformanceClient(), null, null);
			const serverTokenResponse = await this.getServerTokenResponseAsync(response, networkClientHelper, networkRequest, networkRequestOptions);
			responseHandler.validateTokenResponse(serverTokenResponse, serverTokenResponse.correlation_id || "", refreshAccessToken);
			return responseHandler.handleServerTokenResponse(serverTokenResponse, fakeAuthority, reqTimestamp, managedIdentityRequest, ApiId.acquireTokenWithManagedIdentity);
		}
		/**
		* Determines the appropriate query parameter name for user-assigned managed identity
		* based on the identity type, API version, and endpoint characteristics.
		* Different Azure services and API versions use different parameter names for the same identity types.
		*
		* @param managedIdentityIdType - The type of user-assigned managed identity (client ID, object ID, or resource ID)
		* @param isImds - Whether the request is being made to the IMDS (Instance Metadata Service) endpoint
		* @param usesApi2017 - Whether the endpoint uses the 2017-09-01 API version (affects client ID parameter name)
		*
		* @returns The correct query parameter name for the specified identity type and endpoint
		*
		* @throws {ManagedIdentityError} When an invalid managed identity ID type is provided
		*/
		getManagedIdentityUserAssignedIdQueryParameterKey(managedIdentityIdType, isImds, usesApi2017) {
			switch (managedIdentityIdType) {
				case ManagedIdentityIdType.USER_ASSIGNED_CLIENT_ID:
					this.logger.info(`[Managed Identity] [API version ${usesApi2017 ? "2017+" : "2019+"}] Adding user assigned client id to the request.`, "");
					return usesApi2017 ? ManagedIdentityUserAssignedIdQueryParameterNames.MANAGED_IDENTITY_CLIENT_ID_2017 : ManagedIdentityUserAssignedIdQueryParameterNames.MANAGED_IDENTITY_CLIENT_ID;
				case ManagedIdentityIdType.USER_ASSIGNED_RESOURCE_ID:
					this.logger.info("[Managed Identity] Adding user assigned resource id to the request.", "");
					return isImds ? ManagedIdentityUserAssignedIdQueryParameterNames.MANAGED_IDENTITY_RESOURCE_ID_IMDS : ManagedIdentityUserAssignedIdQueryParameterNames.MANAGED_IDENTITY_RESOURCE_ID_NON_IMDS;
				case ManagedIdentityIdType.USER_ASSIGNED_OBJECT_ID:
					this.logger.info("[Managed Identity] Adding user assigned object id to the request.", "");
					return ManagedIdentityUserAssignedIdQueryParameterNames.MANAGED_IDENTITY_OBJECT_ID;
				default: throw createManagedIdentityError(invalidManagedIdentityIdType, "");
			}
		}
	};
	/**
	* Validates and normalizes an environment variable containing a URL string.
	* This static utility method ensures that environment variables used for managed identity
	* endpoints contain properly formatted URLs and provides informative error messages when validation fails.
	*
	* @param envVariableStringName - The name of the environment variable being validated (for error reporting)
	* @param envVariable - The environment variable value containing the URL string
	* @param sourceName - The name of the managed identity source (for error reporting)
	* @param logger - Logger instance for diagnostic information
	*
	* @returns The validated and normalized URL string
	*
	* @throws {ManagedIdentityError} When the environment variable contains a malformed URL
	*/
	BaseManagedIdentitySource.getValidatedEnvVariableUrlString = (envVariableStringName, envVariable, sourceName, logger) => {
		try {
			return new UrlString(envVariable, "").urlString;
		} catch (error) {
			logger.info(`[Managed Identity] ${sourceName} managed identity is unavailable because the '${envVariableStringName}' environment variable is malformed.`, "");
			throw createManagedIdentityError(MsiEnvironmentVariableUrlMalformedErrorCodes[envVariableStringName], "");
		}
	};
	var LinearRetryStrategy = class {
		/**
		* Calculates the number of milliseconds to sleep based on the `retry-after` HTTP header.
		*
		* @param retryHeader - The value of the `retry-after` HTTP header. This can be either a number of seconds
		*                      or an HTTP date string.
		* @returns The number of milliseconds to sleep before retrying the request. If the `retry-after` header is not
		*          present or cannot be parsed, returns 0.
		*/
		calculateDelay(retryHeader, minimumDelay) {
			if (!retryHeader) return minimumDelay;
			let millisToSleep = Math.round(parseFloat(retryHeader) * 1e3);
			if (isNaN(millisToSleep)) millisToSleep = new Date(retryHeader).valueOf() - (/* @__PURE__ */ new Date()).valueOf();
			return Math.max(minimumDelay, millisToSleep);
		}
	};
	const DEFAULT_MANAGED_IDENTITY_MAX_RETRIES = 3;
	const DEFAULT_MANAGED_IDENTITY_RETRY_DELAY_MS = 1e3;
	const DEFAULT_MANAGED_IDENTITY_HTTP_STATUS_CODES_TO_RETRY_ON = [
		HTTP_NOT_FOUND,
		HTTP_REQUEST_TIMEOUT,
		HTTP_TOO_MANY_REQUESTS,
		HTTP_SERVER_ERROR,
		HTTP_SERVICE_UNAVAILABLE,
		HTTP_GATEWAY_TIMEOUT
	];
	var DefaultManagedIdentityRetryPolicy = class DefaultManagedIdentityRetryPolicy {
		constructor() {
			this.linearRetryStrategy = new LinearRetryStrategy();
		}
		static get DEFAULT_MANAGED_IDENTITY_RETRY_DELAY_MS() {
			return DEFAULT_MANAGED_IDENTITY_RETRY_DELAY_MS;
		}
		async pauseForRetry(httpStatusCode, currentRetry, logger, retryAfterHeader) {
			if (DEFAULT_MANAGED_IDENTITY_HTTP_STATUS_CODES_TO_RETRY_ON.includes(httpStatusCode) && currentRetry < DEFAULT_MANAGED_IDENTITY_MAX_RETRIES) {
				const retryAfterDelay = this.linearRetryStrategy.calculateDelay(retryAfterHeader, DefaultManagedIdentityRetryPolicy.DEFAULT_MANAGED_IDENTITY_RETRY_DELAY_MS);
				logger.verbose(`Retrying request in ${retryAfterDelay}ms (retry attempt: ${currentRetry + 1})`, "");
				await new Promise((resolve) => {
					return setTimeout(resolve, retryAfterDelay);
				});
				return true;
			}
			return false;
		}
	};
	var ManagedIdentityRequestParameters = class {
		constructor(httpMethod, endpoint, retryPolicy) {
			this.httpMethod = httpMethod;
			this._baseEndpoint = endpoint;
			this.headers = {};
			this.bodyParameters = {};
			this.queryParameters = {};
			this.retryPolicy = retryPolicy || new DefaultManagedIdentityRetryPolicy();
		}
		computeUri() {
			const parameters = /* @__PURE__ */ new Map();
			if (this.queryParameters) addExtraParameters(parameters, this.queryParameters);
			const queryParametersString = mapToQueryString(parameters);
			return UrlString.appendQueryString(this._baseEndpoint, queryParametersString);
		}
		computeParametersBodyString() {
			const parameters = /* @__PURE__ */ new Map();
			if (this.bodyParameters) addExtraParameters(parameters, this.bodyParameters);
			return mapToQueryString(parameters);
		}
	};
	const APP_SERVICE_MSI_API_VERSION = "2019-08-01";
	/**
	* Azure App Service Managed Identity Source implementation.
	*
	* This class provides managed identity authentication for applications running in Azure App Service.
	* It uses the local metadata service endpoint available within App Service environments to obtain
	* access tokens without requiring explicit credentials.
	*
	* Original source of code: https://github.com/Azure/azure-sdk-for-net/blob/main/sdk/identity/Azure.Identity/src/AppServiceManagedIdentitySource.cs
	*/
	var AppService = class AppService extends BaseManagedIdentitySource {
		/**
		* Creates a new instance of the AppService managed identity source.
		*
		* @param logger - Logger instance for diagnostic output
		* @param nodeStorage - Node.js storage implementation for caching
		* @param networkClient - Network client for making HTTP requests
		* @param cryptoProvider - Cryptographic operations provider
		* @param disableInternalRetries - Whether to disable internal retry logic
		* @param identityEndpoint - The App Service identity endpoint URL
		* @param identityHeader - The secret header value required for authentication
		*/
		constructor(logger, nodeStorage, networkClient, cryptoProvider, disableInternalRetries, identityEndpoint, identityHeader) {
			super(logger, nodeStorage, networkClient, cryptoProvider, disableInternalRetries);
			this.identityEndpoint = identityEndpoint;
			this.identityHeader = identityHeader;
		}
		/**
		* Retrieves the required environment variables for App Service managed identity.
		*
		* App Service managed identity requires two environment variables:
		* - IDENTITY_ENDPOINT: The URL of the local metadata service
		* - IDENTITY_HEADER: A secret header value for authentication
		*
		* @returns An array containing [identityEndpoint, identityHeader] values from environment variables.
		*          Either value may be undefined if the environment variable is not set.
		*/
		static getEnvironmentVariables() {
			return [process.env[ManagedIdentityEnvironmentVariableNames.IDENTITY_ENDPOINT], process.env[ManagedIdentityEnvironmentVariableNames.IDENTITY_HEADER]];
		}
		/**
		* Attempts to create an AppService managed identity source if the environment supports it.
		*
		* This method checks for the presence of required environment variables and validates
		* the identity endpoint URL. If the environment is not suitable for App Service managed
		* identity (missing environment variables or invalid endpoint), it returns null.
		*
		* @param logger - Logger instance for diagnostic output
		* @param nodeStorage - Node.js storage implementation for caching
		* @param networkClient - Network client for making HTTP requests
		* @param cryptoProvider - Cryptographic operations provider
		* @param disableInternalRetries - Whether to disable internal retry logic
		*
		* @returns A new AppService instance if the environment is suitable, null otherwise
		*/
		static tryCreate(logger, nodeStorage, networkClient, cryptoProvider, disableInternalRetries) {
			const [identityEndpoint, identityHeader] = AppService.getEnvironmentVariables();
			if (!identityEndpoint || !identityHeader) {
				logger.info(`[Managed Identity] ${ManagedIdentitySourceNames.APP_SERVICE} managed identity is unavailable because one or both of the '${ManagedIdentityEnvironmentVariableNames.IDENTITY_HEADER}' and '${ManagedIdentityEnvironmentVariableNames.IDENTITY_ENDPOINT}' environment variables are not defined.`, "");
				return null;
			}
			const validatedIdentityEndpoint = AppService.getValidatedEnvVariableUrlString(ManagedIdentityEnvironmentVariableNames.IDENTITY_ENDPOINT, identityEndpoint, ManagedIdentitySourceNames.APP_SERVICE, logger);
			logger.info(`[Managed Identity] Environment variables validation passed for ${ManagedIdentitySourceNames.APP_SERVICE} managed identity. Endpoint URI: ${validatedIdentityEndpoint}. Creating ${ManagedIdentitySourceNames.APP_SERVICE} managed identity.`, "");
			return new AppService(logger, nodeStorage, networkClient, cryptoProvider, disableInternalRetries, identityEndpoint, identityHeader);
		}
		/**
		* Creates a managed identity token request for the App Service environment.
		*
		* This method constructs an HTTP GET request to the App Service identity endpoint
		* with the required headers, query parameters, and managed identity configuration.
		* The request includes the secret header for authentication and appropriate API version.
		*
		* @param resource - The target resource/scope for which to request an access token (e.g., "https://graph.microsoft.com/.default")
		* @param managedIdentityId - The managed identity configuration specifying whether to use system-assigned or user-assigned identity
		*
		* @returns A configured ManagedIdentityRequestParameters object ready for network execution
		*/
		createRequest(resource, managedIdentityId) {
			const request = new ManagedIdentityRequestParameters(HttpMethod.GET, this.identityEndpoint);
			request.headers[ManagedIdentityHeaders.APP_SERVICE_SECRET_HEADER_NAME] = this.identityHeader;
			request.queryParameters[ManagedIdentityQueryParameters.API_VERSION] = APP_SERVICE_MSI_API_VERSION;
			request.queryParameters[ManagedIdentityQueryParameters.RESOURCE] = resource;
			if (managedIdentityId.idType !== ManagedIdentityIdType.SYSTEM_ASSIGNED) request.queryParameters[this.getManagedIdentityUserAssignedIdQueryParameterKey(managedIdentityId.idType)] = managedIdentityId.id;
			return request;
		}
	};
	const ARC_API_VERSION = "2020-06-01";
	const DEFAULT_AZURE_ARC_IDENTITY_ENDPOINT = "http://127.0.0.1:40342/metadata/identity/oauth2/token";
	const HIMDS_EXECUTABLE_HELPER_STRING = "N/A: himds executable exists";
	const SUPPORTED_AZURE_ARC_PLATFORMS = {
		win32: `${process.env["ProgramData"]}\\AzureConnectedMachineAgent\\Tokens\\`,
		linux: "/var/opt/azcmagent/tokens/"
	};
	const AZURE_ARC_FILE_DETECTION = {
		win32: `${process.env["ProgramFiles"]}\\AzureConnectedMachineAgent\\himds.exe`,
		linux: "/opt/azcmagent/bin/himds"
	};
	/**
	* Azure Arc managed identity source implementation for acquiring tokens from Azure Arc-enabled servers.
	*
	* This class provides managed identity authentication for applications running on Azure Arc-enabled servers
	* by communicating with the local Hybrid Instance Metadata Service (HIMDS). It supports both environment
	* variable-based configuration and automatic detection through the HIMDS executable.
	*
	* Original source of code: https://github.com/Azure/azure-sdk-for-net/blob/main/sdk/identity/Azure.Identity/src/AzureArcManagedIdentitySource.cs
	*/
	var AzureArc = class AzureArc extends BaseManagedIdentitySource {
		/**
		* Creates a new instance of the AzureArc managed identity source.
		*
		* @param logger - Logger instance for capturing telemetry and diagnostic information
		* @param nodeStorage - Storage implementation for caching tokens and metadata
		* @param networkClient - Network client for making HTTP requests to the identity endpoint
		* @param cryptoProvider - Cryptographic operations provider for token validation and encryption
		* @param disableInternalRetries - Flag to disable automatic retry logic for failed requests
		* @param identityEndpoint - The Azure Arc identity endpoint URL for token requests
		*/
		constructor(logger, nodeStorage, networkClient, cryptoProvider, disableInternalRetries, identityEndpoint) {
			super(logger, nodeStorage, networkClient, cryptoProvider, disableInternalRetries);
			this.identityEndpoint = identityEndpoint;
		}
		/**
		* Retrieves and validates Azure Arc environment variables for managed identity configuration.
		*
		* This method checks for IDENTITY_ENDPOINT and IMDS_ENDPOINT environment variables.
		* If either is missing, it attempts to detect the Azure Arc environment by checking for
		* the HIMDS executable at platform-specific paths. On successful detection, it returns
		* the default identity endpoint and a helper string indicating file-based detection.
		*
		* @returns An array containing [identityEndpoint, imdsEndpoint] where both values are
		*          strings if Azure Arc is available, or undefined if not available.
		*/
		static getEnvironmentVariables() {
			let identityEndpoint = process.env[ManagedIdentityEnvironmentVariableNames.IDENTITY_ENDPOINT];
			let imdsEndpoint = process.env[ManagedIdentityEnvironmentVariableNames.IMDS_ENDPOINT];
			if (!identityEndpoint || !imdsEndpoint) {
				const fileDetectionPath = AZURE_ARC_FILE_DETECTION[process.platform];
				try {
					fs.accessSync(fileDetectionPath, fs.constants.F_OK | fs.constants.R_OK);
					identityEndpoint = DEFAULT_AZURE_ARC_IDENTITY_ENDPOINT;
					imdsEndpoint = HIMDS_EXECUTABLE_HELPER_STRING;
				} catch (err) {}
			}
			return [identityEndpoint, imdsEndpoint];
		}
		/**
		* Attempts to create an AzureArc managed identity source instance.
		*
		* Validates the Azure Arc environment by checking environment variables
		* and performing file-based detection. Azure Arc supports both system-assigned and user-assigned
		* managed identities; when a user-assigned identity is requested, its selector is forwarded on the
		* request and validated against the token response echo (fail closed). The method performs
		* comprehensive validation of endpoint URLs and logs detailed information about the detection process.
		*
		* @param logger - Logger instance for capturing creation and validation steps
		* @param nodeStorage - Storage implementation for the managed identity source
		* @param networkClient - Network client for HTTP communication
		* @param cryptoProvider - Cryptographic operations provider
		* @param disableInternalRetries - Whether to disable automatic retry mechanisms
		* @param _managedIdentityId - Unused; Azure Arc now supports user-assigned identities, which are
		*          forwarded on the request and validated against the token response echo (fail closed).
		*
		* @returns AzureArc instance if the environment supports Azure Arc managed identity, null otherwise
		*/
		static tryCreate(logger, nodeStorage, networkClient, cryptoProvider, disableInternalRetries, _managedIdentityId) {
			const [identityEndpoint, imdsEndpoint] = AzureArc.getEnvironmentVariables();
			if (!identityEndpoint || !imdsEndpoint) {
				logger.info(`[Managed Identity] ${ManagedIdentitySourceNames.AZURE_ARC} managed identity is unavailable through environment variables because one or both of '${ManagedIdentityEnvironmentVariableNames.IDENTITY_ENDPOINT}' and '${ManagedIdentityEnvironmentVariableNames.IMDS_ENDPOINT}' are not defined. ${ManagedIdentitySourceNames.AZURE_ARC} managed identity is also unavailable through file detection.`, "");
				return null;
			}
			if (imdsEndpoint === HIMDS_EXECUTABLE_HELPER_STRING) logger.info(`[Managed Identity] ${ManagedIdentitySourceNames.AZURE_ARC} managed identity is available through file detection. Defaulting to known ${ManagedIdentitySourceNames.AZURE_ARC} endpoint: ${DEFAULT_AZURE_ARC_IDENTITY_ENDPOINT}. Creating ${ManagedIdentitySourceNames.AZURE_ARC} managed identity.`, "");
			else {
				const validatedIdentityEndpoint = AzureArc.getValidatedEnvVariableUrlString(ManagedIdentityEnvironmentVariableNames.IDENTITY_ENDPOINT, identityEndpoint, ManagedIdentitySourceNames.AZURE_ARC, logger);
				validatedIdentityEndpoint.endsWith("/") && validatedIdentityEndpoint.slice(0, -1);
				AzureArc.getValidatedEnvVariableUrlString(ManagedIdentityEnvironmentVariableNames.IMDS_ENDPOINT, imdsEndpoint, ManagedIdentitySourceNames.AZURE_ARC, logger);
				logger.info(`[Managed Identity] Environment variables validation passed for ${ManagedIdentitySourceNames.AZURE_ARC} managed identity. Endpoint URI: ${validatedIdentityEndpoint}. Creating ${ManagedIdentitySourceNames.AZURE_ARC} managed identity.`, "");
			}
			return new AzureArc(logger, nodeStorage, networkClient, cryptoProvider, disableInternalRetries, identityEndpoint);
		}
		/**
		* Creates a properly formatted HTTP request for acquiring tokens from the Azure Arc identity endpoint.
		*
		* This method constructs a GET request to the Azure Arc HIMDS endpoint with the required metadata header
		* and query parameters. The endpoint URL is normalized to use 127.0.0.1 instead of localhost for
		* consistency. Additional body parameters are calculated by the base class during token acquisition.
		*
		* @param resource - The target resource/scope for which to request an access token (e.g., "https://graph.microsoft.com/.default")
		*
		* @returns A configured ManagedIdentityRequestParameters object ready for network execution
		*/
		createRequest(resource, managedIdentityId) {
			const request = new ManagedIdentityRequestParameters(HttpMethod.GET, this.identityEndpoint.replace("localhost", "127.0.0.1"));
			request.headers[ManagedIdentityHeaders.METADATA_HEADER_NAME] = "true";
			request.queryParameters[ManagedIdentityQueryParameters.API_VERSION] = ARC_API_VERSION;
			request.queryParameters[ManagedIdentityQueryParameters.RESOURCE] = resource;
			if (managedIdentityId.idType !== ManagedIdentityIdType.SYSTEM_ASSIGNED) request.queryParameters[this.getManagedIdentityUserAssignedIdQueryParameterKey(managedIdentityId.idType, true)] = managedIdentityId.id;
			return request;
		}
		/**
		* Fails closed when a user-assigned identity was requested but the Azure Arc token response does
		* not confirm it. A legacy Azure Arc agent ignores the client_id / object_id / msi_res_id selector
		* and silently returns the machine's system-assigned identity; an agent that supports user-assigned
		* managed identity echoes the identity it used. When the echoed identity is missing or does not
		* match the requested selector, MSAL must not return a token for a different identity than requested.
		*
		* @param networkRequest - The request that produced this response; its query parameters carry the
		*                          requested user-assigned selector (client_id / object_id / msi_res_id)
		* @param responseBody - The deserialized Azure Arc token response
		*
		* @throws {ManagedIdentityError} When a user-assigned identity was requested but not confirmed
		*/
		validateUserAssignedIdentityWasHonored(networkRequest, responseBody) {
			const queryParameters = networkRequest.queryParameters;
			let requestedIdentity;
			let echoedIdentity;
			if (queryParameters[ManagedIdentityUserAssignedIdQueryParameterNames.MANAGED_IDENTITY_CLIENT_ID]) {
				requestedIdentity = queryParameters[ManagedIdentityUserAssignedIdQueryParameterNames.MANAGED_IDENTITY_CLIENT_ID];
				echoedIdentity = responseBody.client_id;
			} else if (queryParameters[ManagedIdentityUserAssignedIdQueryParameterNames.MANAGED_IDENTITY_OBJECT_ID]) {
				requestedIdentity = queryParameters[ManagedIdentityUserAssignedIdQueryParameterNames.MANAGED_IDENTITY_OBJECT_ID];
				echoedIdentity = responseBody.object_id;
			} else if (queryParameters[ManagedIdentityUserAssignedIdQueryParameterNames.MANAGED_IDENTITY_RESOURCE_ID_IMDS]) {
				requestedIdentity = queryParameters[ManagedIdentityUserAssignedIdQueryParameterNames.MANAGED_IDENTITY_RESOURCE_ID_IMDS];
				echoedIdentity = responseBody.msi_res_id || responseBody.mi_res_id;
			} else return;
			if (!echoedIdentity || echoedIdentity.toLowerCase() !== requestedIdentity.toLowerCase()) {
				this.logger.error("[Managed Identity] Azure Arc did not confirm the requested user-assigned identity in the token response. The agent likely does not support user-assigned managed identity and returned the system-assigned identity.", "");
				throw createManagedIdentityError(userAssignedManagedIdentityNotConfirmed, "");
			}
		}
		/**
		* Processes the server response and handles Azure Arc-specific authentication challenges.
		*
		* This method implements the Azure Arc authentication flow which may require reading a secret file
		* for authorization. When the initial request returns HTTP 401 Unauthorized, it extracts the file
		* path from the WWW-Authenticate header, validates the file location and size, reads the secret,
		* and retries the request with Basic authentication. The method includes comprehensive security
		* validations to prevent path traversal and ensure file integrity.
		*
		* @param originalResponse - The initial HTTP response from the identity endpoint
		* @param networkClient - Network client for making the retry request if needed
		* @param networkRequest - The original request parameters (modified with auth header for retry)
		* @param networkRequestOptions - Additional options for network requests
		*
		* @returns A promise that resolves to the server token response with access token and metadata
		*
		* @throws {ManagedIdentityError} When:
		*   - WWW-Authenticate header is missing or has unsupported format
		*   - Platform is not supported (not Windows or Linux)
		*   - Secret file has invalid extension (not .key)
		*   - Secret file path doesn't match expected platform path
		*   - Secret file cannot be read or is too large (>4096 bytes)
		* @throws {ClientAuthError} When network errors occur during retry request
		*/
		async getServerTokenResponseAsync(originalResponse, networkClient, networkRequest, networkRequestOptions) {
			let retryResponse;
			if (originalResponse.status === HTTP_UNAUTHORIZED) {
				const wwwAuthHeader = originalResponse.headers["www-authenticate"];
				if (!wwwAuthHeader) throw createManagedIdentityError(wwwAuthenticateHeaderMissing, "");
				if (!wwwAuthHeader.includes("Basic realm=")) throw createManagedIdentityError(wwwAuthenticateHeaderUnsupportedFormat, "");
				const secretFilePath = wwwAuthHeader.split("Basic realm=")[1];
				if (!SUPPORTED_AZURE_ARC_PLATFORMS.hasOwnProperty(process.platform)) throw createManagedIdentityError(platformNotSupported, "");
				const expectedSecretFilePath = SUPPORTED_AZURE_ARC_PLATFORMS[process.platform];
				const fileName = path.basename(secretFilePath);
				if (!fileName.endsWith(".key")) throw createManagedIdentityError(invalidFileExtension, "");
				if (expectedSecretFilePath + fileName !== secretFilePath) throw createManagedIdentityError(invalidFilePath, "");
				let secretFileSize;
				try {
					secretFileSize = await fs.statSync(secretFilePath).size;
				} catch (e) {
					throw createManagedIdentityError(unableToReadSecretFile, "");
				}
				if (secretFileSize > AZURE_ARC_SECRET_FILE_MAX_SIZE_BYTES) throw createManagedIdentityError(invalidSecret, "");
				let secret;
				try {
					secret = fs.readFileSync(secretFilePath, EncodingTypes.UTF8);
				} catch (e) {
					throw createManagedIdentityError(unableToReadSecretFile, "");
				}
				const authHeaderValue = `Basic ${secret}`;
				this.logger.info(`[Managed Identity] Adding authorization header to the request.`, "");
				networkRequest.headers[ManagedIdentityHeaders.AUTHORIZATION_HEADER_NAME] = authHeaderValue;
				try {
					retryResponse = await networkClient.sendGetRequestAsync(networkRequest.computeUri(), networkRequestOptions);
				} catch (error) {
					if (error instanceof AuthError) throw error;
					else throw createClientAuthError(networkError, "");
				}
			}
			const finalResponse = retryResponse || originalResponse;
			if (finalResponse.body.access_token) this.validateUserAssignedIdentityWasHonored(networkRequest, finalResponse.body);
			return this.getServerTokenResponse(finalResponse);
		}
	};
	/**
	* Azure Cloud Shell managed identity source implementation.
	*
	* This class handles authentication for applications running in Azure Cloud Shell environment.
	* Cloud Shell provides a browser-accessible shell for managing Azure resources and includes
	* a pre-configured managed identity for authentication.
	*
	* Original source of code: https://github.com/Azure/azure-sdk-for-net/blob/main/sdk/identity/Azure.Identity/src/CloudShellManagedIdentitySource.cs
	*/
	var CloudShell = class CloudShell extends BaseManagedIdentitySource {
		/**
		* Creates a new CloudShell managed identity source instance.
		*
		* @param logger - Logger instance for diagnostic logging
		* @param nodeStorage - Node.js storage implementation for caching
		* @param networkClient - HTTP client for making requests to the managed identity endpoint
		* @param cryptoProvider - Cryptographic operations provider
		* @param disableInternalRetries - Whether to disable automatic retry logic for failed requests
		* @param msiEndpoint - The MSI endpoint URL obtained from environment variables
		*/
		constructor(logger, nodeStorage, networkClient, cryptoProvider, disableInternalRetries, msiEndpoint) {
			super(logger, nodeStorage, networkClient, cryptoProvider, disableInternalRetries);
			this.msiEndpoint = msiEndpoint;
		}
		/**
		* Retrieves the required environment variables for Cloud Shell managed identity.
		*
		* Cloud Shell requires the MSI_ENDPOINT environment variable to be set, which
		* contains the URL of the managed identity service endpoint.
		*
		* @returns An array containing the MSI_ENDPOINT environment variable value (or undefined if not set)
		*/
		static getEnvironmentVariables() {
			return [process.env[ManagedIdentityEnvironmentVariableNames.MSI_ENDPOINT]];
		}
		/**
		* Attempts to create a CloudShell managed identity source instance.
		*
		* This method validates that the required environment variables are present and
		* creates a CloudShell instance if the environment is properly configured.
		* Cloud Shell only supports system-assigned managed identities.
		*
		* @param logger - Logger instance for diagnostic logging
		* @param nodeStorage - Node.js storage implementation for caching
		* @param networkClient - HTTP client for making requests
		* @param cryptoProvider - Cryptographic operations provider
		* @param disableInternalRetries - Whether to disable automatic retry logic
		* @param managedIdentityId - The managed identity configuration (must be system-assigned)
		*
		* @returns A CloudShell instance if the environment is valid, null otherwise
		*
		* @throws {ManagedIdentityError} When a user-assigned managed identity is requested,
		*         as Cloud Shell only supports system-assigned identities
		*/
		static tryCreate(logger, nodeStorage, networkClient, cryptoProvider, disableInternalRetries, managedIdentityId) {
			const [msiEndpoint] = CloudShell.getEnvironmentVariables();
			if (!msiEndpoint) {
				logger.info(`[Managed Identity] ${ManagedIdentitySourceNames.CLOUD_SHELL} managed identity is unavailable because the '${ManagedIdentityEnvironmentVariableNames.MSI_ENDPOINT} environment variable is not defined.`, "");
				return null;
			}
			const validatedMsiEndpoint = CloudShell.getValidatedEnvVariableUrlString(ManagedIdentityEnvironmentVariableNames.MSI_ENDPOINT, msiEndpoint, ManagedIdentitySourceNames.CLOUD_SHELL, logger);
			logger.info(`[Managed Identity] Environment variable validation passed for ${ManagedIdentitySourceNames.CLOUD_SHELL} managed identity. Endpoint URI: ${validatedMsiEndpoint}. Creating ${ManagedIdentitySourceNames.CLOUD_SHELL} managed identity.`, "");
			if (managedIdentityId.idType !== ManagedIdentityIdType.SYSTEM_ASSIGNED) throw createManagedIdentityError(unableToCreateCloudShell, "");
			return new CloudShell(logger, nodeStorage, networkClient, cryptoProvider, disableInternalRetries, msiEndpoint);
		}
		/**
		* Creates an HTTP request to acquire an access token from the Cloud Shell managed identity endpoint.
		*
		* This method constructs a POST request to the MSI endpoint with the required headers and
		* body parameters for Cloud Shell authentication. The request includes the target resource
		* for which the access token is being requested.
		*
		* @param resource - The target resource/scope for which to request an access token (e.g., "https://graph.microsoft.com/.default")
		*
		* @returns A configured ManagedIdentityRequestParameters object ready for network execution
		*/
		createRequest(resource) {
			const request = new ManagedIdentityRequestParameters(HttpMethod.POST, this.msiEndpoint);
			request.headers[ManagedIdentityHeaders.METADATA_HEADER_NAME] = "true";
			request.bodyParameters[ManagedIdentityQueryParameters.RESOURCE] = resource;
			return request;
		}
	};
	var ExponentialRetryStrategy = class {
		constructor(minExponentialBackoff, maxExponentialBackoff, exponentialDeltaBackoff) {
			this.minExponentialBackoff = minExponentialBackoff;
			this.maxExponentialBackoff = maxExponentialBackoff;
			this.exponentialDeltaBackoff = exponentialDeltaBackoff;
		}
		/**
		* Calculates the exponential delay based on the current retry attempt.
		*
		* @param {number} currentRetry - The current retry attempt number.
		* @returns {number} - The calculated exponential delay in milliseconds.
		*
		* The delay is calculated using the formula:
		* - If `currentRetry` is 0, it returns the minimum backoff time.
		* - Otherwise, it calculates the delay as the minimum of:
		*   - `(2^(currentRetry - 1)) * deltaBackoff`
		*   - `maxBackoff`
		*
		* This ensures that the delay increases exponentially with each retry attempt,
		* but does not exceed the maximum backoff time.
		*/
		calculateDelay(currentRetry) {
			if (currentRetry === 0) return this.minExponentialBackoff;
			return Math.min(Math.pow(2, currentRetry - 1) * this.exponentialDeltaBackoff, this.maxExponentialBackoff);
		}
	};
	const HTTP_STATUS_400_CODES_FOR_EXPONENTIAL_STRATEGY = [
		HTTP_NOT_FOUND,
		HTTP_REQUEST_TIMEOUT,
		HTTP_GONE,
		HTTP_TOO_MANY_REQUESTS
	];
	const EXPONENTIAL_STRATEGY_NUM_RETRIES = 3;
	const LINEAR_STRATEGY_NUM_RETRIES = 7;
	const MIN_EXPONENTIAL_BACKOFF_MS = 1e3;
	const MAX_EXPONENTIAL_BACKOFF_MS = 4e3;
	const EXPONENTIAL_DELTA_BACKOFF_MS = 2e3;
	const HTTP_STATUS_GONE_RETRY_AFTER_MS = 10 * 1e3;
	var ImdsRetryPolicy = class ImdsRetryPolicy {
		constructor() {
			this.exponentialRetryStrategy = new ExponentialRetryStrategy(ImdsRetryPolicy.MIN_EXPONENTIAL_BACKOFF_MS, ImdsRetryPolicy.MAX_EXPONENTIAL_BACKOFF_MS, ImdsRetryPolicy.EXPONENTIAL_DELTA_BACKOFF_MS);
		}
		static get MIN_EXPONENTIAL_BACKOFF_MS() {
			return MIN_EXPONENTIAL_BACKOFF_MS;
		}
		static get MAX_EXPONENTIAL_BACKOFF_MS() {
			return MAX_EXPONENTIAL_BACKOFF_MS;
		}
		static get EXPONENTIAL_DELTA_BACKOFF_MS() {
			return EXPONENTIAL_DELTA_BACKOFF_MS;
		}
		static get HTTP_STATUS_GONE_RETRY_AFTER_MS() {
			return HTTP_STATUS_GONE_RETRY_AFTER_MS;
		}
		set isNewRequest(value) {
			this._isNewRequest = value;
		}
		/**
		* Pauses execution for a calculated delay before retrying a request.
		*
		* @param httpStatusCode - The HTTP status code of the response.
		* @param currentRetry - The current retry attempt number.
		* @param retryAfterHeader - The value of the "retry-after" header from the response.
		* @returns A promise that resolves to a boolean indicating whether a retry should be attempted.
		*/
		async pauseForRetry(httpStatusCode, currentRetry, logger) {
			if (this._isNewRequest) {
				this._isNewRequest = false;
				this.maxRetries = httpStatusCode === HTTP_GONE ? LINEAR_STRATEGY_NUM_RETRIES : EXPONENTIAL_STRATEGY_NUM_RETRIES;
			}
			/**
			* (status code is one of the retriable 400 status code
			* or
			* status code is >= 500 and <= 599)
			* and
			* current count of retries is less than the max number of retries
			*/
			if ((HTTP_STATUS_400_CODES_FOR_EXPONENTIAL_STRATEGY.includes(httpStatusCode) || httpStatusCode >= HTTP_SERVER_ERROR_RANGE_START && httpStatusCode <= HTTP_SERVER_ERROR_RANGE_END && currentRetry < this.maxRetries) && currentRetry < this.maxRetries) {
				const retryAfterDelay = httpStatusCode === HTTP_GONE ? ImdsRetryPolicy.HTTP_STATUS_GONE_RETRY_AFTER_MS : this.exponentialRetryStrategy.calculateDelay(currentRetry);
				logger.verbose(`Retrying request in ${retryAfterDelay}ms (retry attempt: ${currentRetry + 1})`, "");
				await new Promise((resolve) => {
					return setTimeout(resolve, retryAfterDelay);
				});
				return true;
			}
			return false;
		}
	};
	const IMDS_TOKEN_PATH = "/metadata/identity/oauth2/token";
	const DEFAULT_IMDS_ENDPOINT = `http://169.254.169.254${IMDS_TOKEN_PATH}`;
	const IMDS_API_VERSION = "2018-02-01";
	/**
	* Managed Identity source implementation for Azure Instance Metadata Service (IMDS).
	*
	* IMDS is available on Azure Virtual Machines and Virtual Machine Scale Sets and provides
	* a REST endpoint to obtain OAuth tokens for managed identities. This implementation
	* handles both system-assigned and user-assigned managed identities.
	*
	* Original source of code: https://github.com/Azure/azure-sdk-for-net/blob/main/sdk/identity/Azure.Identity/src/ImdsManagedIdentitySource.cs
	*/
	var Imds = class Imds extends BaseManagedIdentitySource {
		/**
		* Constructs an Imds instance with the specified configuration.
		*
		* @param logger - Logger instance for recording debug information and errors
		* @param nodeStorage - NodeStorage instance used for token caching operations
		* @param networkClient - Network client implementation for making HTTP requests to IMDS
		* @param cryptoProvider - CryptoProvider for generating correlation IDs and other cryptographic operations
		* @param disableInternalRetries - When true, disables the built-in retry logic for IMDS requests
		* @param identityEndpoint - The complete IMDS endpoint URL including the token path
		*/
		constructor(logger, nodeStorage, networkClient, cryptoProvider, disableInternalRetries, identityEndpoint) {
			super(logger, nodeStorage, networkClient, cryptoProvider, disableInternalRetries);
			this.identityEndpoint = identityEndpoint;
		}
		/**
		* Creates an Imds instance with the appropriate endpoint configuration.
		*
		* This method checks for the presence of the AZURE_POD_IDENTITY_AUTHORITY_HOST environment
		* variable, which is used in Azure Kubernetes Service (AKS) environments with Azure AD
		* Pod Identity. If found, it uses that endpoint; otherwise, it falls back to the standard
		* IMDS endpoint (169.254.169.254).
		*
		* @param logger - Logger instance for recording endpoint discovery and validation
		* @param nodeStorage - NodeStorage instance for token caching
		* @param networkClient - Network client for HTTP requests
		* @param cryptoProvider - CryptoProvider for cryptographic operations
		* @param disableInternalRetries - Whether to disable built-in retry logic
		*
		* @returns A configured Imds instance ready to make token requests
		*/
		static tryCreate(logger, nodeStorage, networkClient, cryptoProvider, disableInternalRetries) {
			let validatedIdentityEndpoint;
			if (process.env[ManagedIdentityEnvironmentVariableNames.AZURE_POD_IDENTITY_AUTHORITY_HOST]) {
				logger.info(`[Managed Identity] Environment variable ${ManagedIdentityEnvironmentVariableNames.AZURE_POD_IDENTITY_AUTHORITY_HOST} for ${ManagedIdentitySourceNames.IMDS} returned endpoint: ${process.env[ManagedIdentityEnvironmentVariableNames.AZURE_POD_IDENTITY_AUTHORITY_HOST]}`, "");
				validatedIdentityEndpoint = Imds.getValidatedEnvVariableUrlString(ManagedIdentityEnvironmentVariableNames.AZURE_POD_IDENTITY_AUTHORITY_HOST, `${process.env[ManagedIdentityEnvironmentVariableNames.AZURE_POD_IDENTITY_AUTHORITY_HOST]}${IMDS_TOKEN_PATH}`, ManagedIdentitySourceNames.IMDS, logger);
			} else {
				logger.info(`[Managed Identity] Unable to find ${ManagedIdentityEnvironmentVariableNames.AZURE_POD_IDENTITY_AUTHORITY_HOST} environment variable for ${ManagedIdentitySourceNames.IMDS}, using the default endpoint.`, "");
				validatedIdentityEndpoint = DEFAULT_IMDS_ENDPOINT;
			}
			return new Imds(logger, nodeStorage, networkClient, cryptoProvider, disableInternalRetries, validatedIdentityEndpoint);
		}
		/**
		* Creates a properly configured HTTP request for acquiring an access token from IMDS.
		*
		* This method builds a complete request object with all necessary headers, query parameters,
		* and retry policies required by the Azure Instance Metadata Service.
		*
		* Key request components:
		* - HTTP GET method to the IMDS token endpoint
		* - Metadata header set to "true" (required by IMDS)
		* - API version parameter (currently "2018-02-01")
		* - Resource parameter specifying the target audience
		* - Identity-specific parameters for user-assigned managed identities
		* - IMDS-specific retry policy
		*
		* @param resource - The target resource/scope for which to request an access token (e.g., "https://graph.microsoft.com/.default")
		* @param managedIdentityId - The managed identity configuration specifying whether to use system-assigned or user-assigned identity
		*
		* @returns A configured ManagedIdentityRequestParameters object ready for network execution
		*/
		createRequest(resource, managedIdentityId) {
			const request = new ManagedIdentityRequestParameters(HttpMethod.GET, this.identityEndpoint);
			request.headers[ManagedIdentityHeaders.METADATA_HEADER_NAME] = "true";
			request.headers[ManagedIdentityHeaders.CLIENT_SKU] = Constants.MSAL_SKU;
			request.headers[ManagedIdentityHeaders.CLIENT_VER] = version;
			request.headers[ManagedIdentityHeaders.CLIENT_REQUEST_ID] = this.createCorrelationId();
			request.queryParameters[ManagedIdentityQueryParameters.API_VERSION] = IMDS_API_VERSION;
			request.queryParameters[ManagedIdentityQueryParameters.RESOURCE] = resource;
			if (managedIdentityId.idType !== ManagedIdentityIdType.SYSTEM_ASSIGNED) request.queryParameters[this.getManagedIdentityUserAssignedIdQueryParameterKey(managedIdentityId.idType, true)] = managedIdentityId.id;
			request.retryPolicy = new ImdsRetryPolicy();
			return request;
		}
	};
	const SERVICE_FABRIC_MSI_API_VERSION = "2019-07-01-preview";
	/**
	* Original source of code: https://github.com/Azure/azure-sdk-for-net/blob/main/sdk/identity/Azure.Identity/src/ServiceFabricManagedIdentitySource.cs
	*/
	var ServiceFabric = class ServiceFabric extends BaseManagedIdentitySource {
		/**
		* Constructs a new ServiceFabric managed identity source for acquiring tokens from Azure Service Fabric clusters.
		*
		* Service Fabric managed identity allows applications running in Service Fabric clusters to authenticate
		* without storing credentials in code. This source handles token acquisition using the Service Fabric
		* Managed Identity Token Service (MITS).
		*
		* @param logger - Logger instance for logging authentication events and debugging information
		* @param nodeStorage - NodeStorage instance for caching tokens and other authentication artifacts
		* @param networkClient - Network client for making HTTP requests to the Service Fabric identity endpoint
		* @param cryptoProvider - Crypto provider for cryptographic operations like token validation
		* @param disableInternalRetries - Whether to disable internal retry logic for failed requests
		* @param identityEndpoint - The Service Fabric managed identity endpoint URL
		* @param identityHeader - The Service Fabric managed identity secret header value
		*/
		constructor(logger, nodeStorage, networkClient, cryptoProvider, disableInternalRetries, identityEndpoint, identityHeader) {
			super(logger, nodeStorage, networkClient, cryptoProvider, disableInternalRetries);
			this.identityEndpoint = identityEndpoint;
			this.identityHeader = identityHeader;
		}
		/**
		* Retrieves the environment variables required for Service Fabric managed identity authentication.
		*
		* Service Fabric managed identity requires three specific environment variables to be set by the
		* Service Fabric runtime:
		* - IDENTITY_ENDPOINT: The endpoint URL for the Managed Identity Token Service (MITS)
		* - IDENTITY_HEADER: A secret value used for authentication with the MITS
		* - IDENTITY_SERVER_THUMBPRINT: The thumbprint of the MITS server certificate for secure communication
		*
		* @returns An array containing the identity endpoint, identity header, and identity server thumbprint values.
		*          Elements will be undefined if the corresponding environment variables are not set.
		*/
		static getEnvironmentVariables() {
			return [
				process.env[ManagedIdentityEnvironmentVariableNames.IDENTITY_ENDPOINT],
				process.env[ManagedIdentityEnvironmentVariableNames.IDENTITY_HEADER],
				process.env[ManagedIdentityEnvironmentVariableNames.IDENTITY_SERVER_THUMBPRINT]
			];
		}
		/**
		* Attempts to create a ServiceFabric managed identity source if the runtime environment supports it.
		*
		* Checks for the presence of all required Service Fabric environment variables
		* and validates the endpoint URL format. It will only create a ServiceFabric instance if the application
		* is running in a properly configured Service Fabric cluster with managed identity enabled.
		*
		* Note: User-assigned managed identities must be configured at the cluster level, not at runtime.
		* This method will log a warning if a user-assigned identity is requested.
		*
		* @param logger - Logger instance for logging creation events and validation results
		* @param nodeStorage - NodeStorage instance for caching tokens and authentication artifacts
		* @param networkClient - Network client for making HTTP requests to the identity endpoint
		* @param cryptoProvider - Crypto provider for cryptographic operations
		* @param disableInternalRetries - Whether to disable internal retry logic for failed requests
		* @param managedIdentityId - Managed identity identifier specifying system-assigned or user-assigned identity
		*
		* @returns A ServiceFabric instance if all environment variables are valid and present, otherwise null
		*/
		static tryCreate(logger, nodeStorage, networkClient, cryptoProvider, disableInternalRetries, managedIdentityId) {
			const [identityEndpoint, identityHeader, identityServerThumbprint] = ServiceFabric.getEnvironmentVariables();
			if (!identityEndpoint || !identityHeader || !identityServerThumbprint) {
				logger.info(`[Managed Identity] ${ManagedIdentitySourceNames.SERVICE_FABRIC} managed identity is unavailable because one or all of the '${ManagedIdentityEnvironmentVariableNames.IDENTITY_HEADER}', '${ManagedIdentityEnvironmentVariableNames.IDENTITY_ENDPOINT}' or '${ManagedIdentityEnvironmentVariableNames.IDENTITY_SERVER_THUMBPRINT}' environment variables are not defined.`, "");
				return null;
			}
			const validatedIdentityEndpoint = ServiceFabric.getValidatedEnvVariableUrlString(ManagedIdentityEnvironmentVariableNames.IDENTITY_ENDPOINT, identityEndpoint, ManagedIdentitySourceNames.SERVICE_FABRIC, logger);
			logger.info(`[Managed Identity] Environment variables validation passed for ${ManagedIdentitySourceNames.SERVICE_FABRIC} managed identity. Endpoint URI: ${validatedIdentityEndpoint}. Creating ${ManagedIdentitySourceNames.SERVICE_FABRIC} managed identity.`, "");
			if (managedIdentityId.idType !== ManagedIdentityIdType.SYSTEM_ASSIGNED) logger.warning(`[Managed Identity] ${ManagedIdentitySourceNames.SERVICE_FABRIC} user assigned managed identity is configured in the cluster, not during runtime. See also: https://learn.microsoft.com/en-us/azure/service-fabric/configure-existing-cluster-enable-managed-identity-token-service.`, "");
			return new ServiceFabric(logger, nodeStorage, networkClient, cryptoProvider, disableInternalRetries, identityEndpoint, identityHeader);
		}
		/**
		* Creates HTTP request parameters for acquiring an access token from the Service Fabric Managed Identity Token Service (MITS).
		*
		* This method constructs a properly formatted HTTP GET request that includes:
		* - The secret header for authentication with MITS
		* - API version parameter for the Service Fabric MSI endpoint
		* - Resource parameter specifying the target Azure service
		* - Optional identity parameters for user-assigned managed identities
		*
		* The request follows the Service Fabric managed identity protocol and uses the 2019-07-01-preview API version.
		* For user-assigned identities, the appropriate query parameter (client_id, object_id, or resource_id) is added
		* based on the identity type.
		*
		* @param resource - The Azure resource URI for which the access token is requested (e.g., "https://vault.azure.net/")
		* @param managedIdentityId - The managed identity configuration specifying system-assigned or user-assigned identity details
		*
		* @returns A configured ManagedIdentityRequestParameters object ready for network execution
		*/
		createRequest(resource, managedIdentityId) {
			const request = new ManagedIdentityRequestParameters(HttpMethod.GET, this.identityEndpoint);
			request.headers[ManagedIdentityHeaders.ML_AND_SF_SECRET_HEADER_NAME] = this.identityHeader;
			request.queryParameters[ManagedIdentityQueryParameters.API_VERSION] = SERVICE_FABRIC_MSI_API_VERSION;
			request.queryParameters[ManagedIdentityQueryParameters.RESOURCE] = resource;
			if (managedIdentityId.idType !== ManagedIdentityIdType.SYSTEM_ASSIGNED) request.queryParameters[this.getManagedIdentityUserAssignedIdQueryParameterKey(managedIdentityId.idType)] = managedIdentityId.id;
			return request;
		}
	};
	const MACHINE_LEARNING_MSI_API_VERSION = "2017-09-01";
	const MANAGED_IDENTITY_MACHINE_LEARNING_UNSUPPORTED_ID_TYPE_ERROR = `Only client id is supported for user-assigned managed identity in ${ManagedIdentitySourceNames.MACHINE_LEARNING}.`;
	/**
	* Machine Learning Managed Identity Source implementation for Azure Machine Learning environments.
	*
	* This class handles managed identity authentication specifically for Azure Machine Learning services.
	* It supports both system-assigned and user-assigned managed identities, using the MSI_ENDPOINT
	* and MSI_SECRET environment variables that are automatically provided in Azure ML environments.
	*/
	var MachineLearning = class MachineLearning extends BaseManagedIdentitySource {
		/**
		* Creates a new MachineLearning managed identity source instance.
		*
		* @param logger - Logger instance for diagnostic information
		* @param nodeStorage - Node storage implementation for caching
		* @param networkClient - Network client for making HTTP requests
		* @param cryptoProvider - Cryptographic operations provider
		* @param disableInternalRetries - Whether to disable automatic request retries
		* @param msiEndpoint - The MSI endpoint URL from environment variables
		* @param secret - The MSI secret from environment variables
		*/
		constructor(logger, nodeStorage, networkClient, cryptoProvider, disableInternalRetries, msiEndpoint, secret) {
			super(logger, nodeStorage, networkClient, cryptoProvider, disableInternalRetries);
			this.msiEndpoint = msiEndpoint;
			this.secret = secret;
		}
		/**
		* Retrieves the required environment variables for Azure Machine Learning managed identity.
		*
		* This method checks for the presence of MSI_ENDPOINT and MSI_SECRET environment variables
		* that are automatically set by the Azure Machine Learning platform when managed identity
		* is enabled for the compute instance or cluster.
		*
		* @returns An array containing [msiEndpoint, secret] where either value may be undefined
		*          if the corresponding environment variable is not set
		*/
		static getEnvironmentVariables() {
			return [process.env[ManagedIdentityEnvironmentVariableNames.MSI_ENDPOINT], process.env[ManagedIdentityEnvironmentVariableNames.MSI_SECRET]];
		}
		/**
		* Attempts to create a MachineLearning managed identity source.
		*
		* This method validates the Azure Machine Learning environment by checking for the required
		* MSI_ENDPOINT and MSI_SECRET environment variables. If both are present and valid,
		* it creates and returns a MachineLearning instance. If either is missing or invalid,
		* it returns null, indicating that this managed identity source is not available
		* in the current environment.
		*
		* @param logger - Logger instance for diagnostic information
		* @param nodeStorage - Node storage implementation for caching
		* @param networkClient - Network client for making HTTP requests
		* @param cryptoProvider - Cryptographic operations provider
		* @param disableInternalRetries - Whether to disable automatic request retries
		*
		* @returns A new MachineLearning instance if the environment is valid, null otherwise
		*/
		static tryCreate(logger, nodeStorage, networkClient, cryptoProvider, disableInternalRetries) {
			const [msiEndpoint, secret] = MachineLearning.getEnvironmentVariables();
			if (!msiEndpoint || !secret) {
				logger.info(`[Managed Identity] ${ManagedIdentitySourceNames.MACHINE_LEARNING} managed identity is unavailable because one or both of the '${ManagedIdentityEnvironmentVariableNames.MSI_ENDPOINT}' and '${ManagedIdentityEnvironmentVariableNames.MSI_SECRET}' environment variables are not defined.`, "");
				return null;
			}
			const validatedMsiEndpoint = MachineLearning.getValidatedEnvVariableUrlString(ManagedIdentityEnvironmentVariableNames.MSI_ENDPOINT, msiEndpoint, ManagedIdentitySourceNames.MACHINE_LEARNING, logger);
			logger.info(`[Managed Identity] Environment variables validation passed for ${ManagedIdentitySourceNames.MACHINE_LEARNING} managed identity. Endpoint URI: ${validatedMsiEndpoint}. Creating ${ManagedIdentitySourceNames.MACHINE_LEARNING} managed identity.`, "");
			return new MachineLearning(logger, nodeStorage, networkClient, cryptoProvider, disableInternalRetries, msiEndpoint, secret);
		}
		/**
		* Creates a managed identity token request for Azure Machine Learning environments.
		*
		* This method constructs the HTTP request parameters needed to acquire an access token
		* from the Azure Machine Learning managed identity endpoint. It handles both system-assigned
		* and user-assigned managed identities with specific logic for each type:
		*
		* - System-assigned: Uses the DEFAULT_IDENTITY_CLIENT_ID environment variable
		* - User-assigned: Only supports client ID-based identification (not object ID or resource ID)
		*
		* The request uses the 2017-09-01 API version and includes the required secret header
		* for authentication with the MSI endpoint.
		*
		* @param resource - The target resource/scope for which to request an access token (e.g., "https://graph.microsoft.com/.default")
		* @param managedIdentityId - The managed identity configuration specifying whether to use system-assigned or user-assigned identity
		*
		* @returns A configured ManagedIdentityRequestParameters object ready for network execution
		*
		* @throws Error if an unsupported managed identity ID type is specified (only client ID is supported for user-assigned)
		*/
		createRequest(resource, managedIdentityId) {
			const request = new ManagedIdentityRequestParameters(HttpMethod.GET, this.msiEndpoint);
			request.headers[ManagedIdentityHeaders.METADATA_HEADER_NAME] = "true";
			request.headers[ManagedIdentityHeaders.ML_AND_SF_SECRET_HEADER_NAME] = this.secret;
			request.queryParameters[ManagedIdentityQueryParameters.API_VERSION] = MACHINE_LEARNING_MSI_API_VERSION;
			request.queryParameters[ManagedIdentityQueryParameters.RESOURCE] = resource;
			if (managedIdentityId.idType === ManagedIdentityIdType.SYSTEM_ASSIGNED) request.queryParameters[ManagedIdentityUserAssignedIdQueryParameterNames.MANAGED_IDENTITY_CLIENT_ID_2017] = process.env[ManagedIdentityEnvironmentVariableNames.DEFAULT_IDENTITY_CLIENT_ID];
			else if (managedIdentityId.idType === ManagedIdentityIdType.USER_ASSIGNED_CLIENT_ID) request.queryParameters[this.getManagedIdentityUserAssignedIdQueryParameterKey(managedIdentityId.idType, false, true)] = managedIdentityId.id;
			else throw new Error(MANAGED_IDENTITY_MACHINE_LEARNING_UNSUPPORTED_ID_TYPE_ERROR);
			return request;
		}
	};
	var ManagedIdentityClient = class ManagedIdentityClient {
		constructor(logger, nodeStorage, networkClient, cryptoProvider, disableInternalRetries) {
			this.logger = logger;
			this.nodeStorage = nodeStorage;
			this.networkClient = networkClient;
			this.cryptoProvider = cryptoProvider;
			this.disableInternalRetries = disableInternalRetries;
		}
		async sendManagedIdentityTokenRequest(managedIdentityRequest, managedIdentityId, fakeAuthority, refreshAccessToken) {
			if (!ManagedIdentityClient.identitySource) ManagedIdentityClient.identitySource = this.selectManagedIdentitySource(this.logger, this.nodeStorage, this.networkClient, this.cryptoProvider, this.disableInternalRetries, managedIdentityId);
			return ManagedIdentityClient.identitySource.acquireTokenWithManagedIdentity(managedIdentityRequest, managedIdentityId, fakeAuthority, refreshAccessToken);
		}
		allEnvironmentVariablesAreDefined(environmentVariables) {
			return Object.values(environmentVariables).every((environmentVariable) => {
				return environmentVariable !== void 0;
			});
		}
		/**
		* Determine the Managed Identity Source based on available environment variables. This API is consumed by ManagedIdentityApplication's getManagedIdentitySource.
		* @returns ManagedIdentitySourceNames - The Managed Identity source's name
		*/
		getManagedIdentitySource() {
			ManagedIdentityClient.sourceName = this.allEnvironmentVariablesAreDefined(ServiceFabric.getEnvironmentVariables()) ? ManagedIdentitySourceNames.SERVICE_FABRIC : this.allEnvironmentVariablesAreDefined(AppService.getEnvironmentVariables()) ? ManagedIdentitySourceNames.APP_SERVICE : this.allEnvironmentVariablesAreDefined(MachineLearning.getEnvironmentVariables()) ? ManagedIdentitySourceNames.MACHINE_LEARNING : this.allEnvironmentVariablesAreDefined(CloudShell.getEnvironmentVariables()) ? ManagedIdentitySourceNames.CLOUD_SHELL : this.allEnvironmentVariablesAreDefined(AzureArc.getEnvironmentVariables()) ? ManagedIdentitySourceNames.AZURE_ARC : ManagedIdentitySourceNames.DEFAULT_TO_IMDS;
			return ManagedIdentityClient.sourceName;
		}
		/**
		* Tries to create a managed identity source for all sources
		* @returns the managed identity Source
		*/
		selectManagedIdentitySource(logger, nodeStorage, networkClient, cryptoProvider, disableInternalRetries, managedIdentityId) {
			const source = ServiceFabric.tryCreate(logger, nodeStorage, networkClient, cryptoProvider, disableInternalRetries, managedIdentityId) || AppService.tryCreate(logger, nodeStorage, networkClient, cryptoProvider, disableInternalRetries) || MachineLearning.tryCreate(logger, nodeStorage, networkClient, cryptoProvider, disableInternalRetries) || CloudShell.tryCreate(logger, nodeStorage, networkClient, cryptoProvider, disableInternalRetries, managedIdentityId) || AzureArc.tryCreate(logger, nodeStorage, networkClient, cryptoProvider, disableInternalRetries, managedIdentityId) || Imds.tryCreate(logger, nodeStorage, networkClient, cryptoProvider, disableInternalRetries);
			if (!source) throw createManagedIdentityError(unableToCreateSource, "");
			return source;
		}
	};
	const SOURCES_THAT_SUPPORT_TOKEN_REVOCATION = [ManagedIdentitySourceNames.SERVICE_FABRIC];
	/**
	* Class to initialize a managed identity and identify the service
	* @public
	*/
	var ManagedIdentityApplication = class ManagedIdentityApplication {
		constructor(configuration) {
			this.config = buildManagedIdentityConfiguration(configuration || {});
			this.logger = new Logger(this.config.system.loggerOptions, name, version);
			const fakeStatusAuthorityOptions = { canonicalAuthority: DEFAULT_AUTHORITY };
			if (!ManagedIdentityApplication.nodeStorage) ManagedIdentityApplication.nodeStorage = new NodeStorage(this.logger, this.config.managedIdentityId.id, DEFAULT_CRYPTO_IMPLEMENTATION, fakeStatusAuthorityOptions);
			this.networkClient = this.config.system.networkClient;
			this.cryptoProvider = new CryptoProvider();
			const fakeAuthorityOptions = {
				protocolMode: ProtocolMode.AAD,
				knownAuthorities: [DEFAULT_AUTHORITY_FOR_MANAGED_IDENTITY],
				cloudDiscoveryMetadata: "",
				authorityMetadata: ""
			};
			this.fakeAuthority = new Authority(DEFAULT_AUTHORITY_FOR_MANAGED_IDENTITY, this.networkClient, ManagedIdentityApplication.nodeStorage, fakeAuthorityOptions, this.logger, this.cryptoProvider.createNewGuid(), new StubPerformanceClient(), true);
			this.fakeClientCredentialClient = new ClientCredentialClient({ authOptions: {
				clientId: this.config.managedIdentityId.id,
				authority: this.fakeAuthority
			} });
			this.managedIdentityClient = new ManagedIdentityClient(this.logger, ManagedIdentityApplication.nodeStorage, this.networkClient, this.cryptoProvider, this.config.disableInternalRetries);
			this.hashUtils = new HashUtils();
		}
		/**
		* Acquire an access token from the cache or the managed identity
		* @param managedIdentityRequest - the ManagedIdentityRequestParams object passed in by the developer
		* @returns the access token
		*/
		async acquireToken(managedIdentityRequestParams) {
			if (!managedIdentityRequestParams.resource) throw createClientConfigurationError(urlEmptyError, "");
			const managedIdentityRequest = {
				forceRefresh: managedIdentityRequestParams.forceRefresh,
				resource: managedIdentityRequestParams.resource.replace("/.default", ""),
				scopes: [managedIdentityRequestParams.resource.replace("/.default", "")],
				authority: this.fakeAuthority.canonicalAuthority,
				correlationId: this.cryptoProvider.createNewGuid(),
				claims: managedIdentityRequestParams.claims,
				clientCapabilities: this.config.clientCapabilities
			};
			if (managedIdentityRequest.forceRefresh) return this.acquireTokenFromManagedIdentity(managedIdentityRequest, this.config.managedIdentityId, this.fakeAuthority);
			const [cachedAuthenticationResult, lastCacheOutcome] = await this.fakeClientCredentialClient.getCachedAuthenticationResult(managedIdentityRequest, this.config, this.cryptoProvider, this.fakeAuthority, ManagedIdentityApplication.nodeStorage);
			if (managedIdentityRequest.claims) {
				const sourceName = this.managedIdentityClient.getManagedIdentitySource();
				if (cachedAuthenticationResult && SOURCES_THAT_SUPPORT_TOKEN_REVOCATION.includes(sourceName)) managedIdentityRequest.revokedTokenSha256Hash = this.hashUtils.sha256(cachedAuthenticationResult.accessToken).toString(EncodingTypes.HEX);
				return this.acquireTokenFromManagedIdentity(managedIdentityRequest, this.config.managedIdentityId, this.fakeAuthority);
			}
			if (cachedAuthenticationResult) {
				if (lastCacheOutcome === CacheOutcome.PROACTIVELY_REFRESHED) {
					this.logger.info("ClientCredentialClient:getCachedAuthenticationResult - Cached access token's refreshOn property has been exceeded'. It's not expired, but must be refreshed.", managedIdentityRequest.correlationId);
					await this.acquireTokenFromManagedIdentity(managedIdentityRequest, this.config.managedIdentityId, this.fakeAuthority, true);
				}
				return cachedAuthenticationResult;
			} else return this.acquireTokenFromManagedIdentity(managedIdentityRequest, this.config.managedIdentityId, this.fakeAuthority);
		}
		/**
		* Acquires a token from a managed identity endpoint.
		*
		* @param managedIdentityRequest - The request object containing parameters for the managed identity token request.
		* @param managedIdentityId - The identifier for the managed identity (e.g., client ID or resource ID).
		* @param fakeAuthority - A placeholder authority used for the token request.
		* @param refreshAccessToken - Optional flag indicating whether to force a refresh of the access token.
		* @returns A promise that resolves to an AuthenticationResult containing the acquired token and related information.
		*/
		async acquireTokenFromManagedIdentity(managedIdentityRequest, managedIdentityId, fakeAuthority, refreshAccessToken) {
			return this.managedIdentityClient.sendManagedIdentityTokenRequest(managedIdentityRequest, managedIdentityId, fakeAuthority, refreshAccessToken);
		}
		/**
		* Determine the Managed Identity Source based on available environment variables. This API is consumed by Azure Identity SDK.
		* @returns ManagedIdentitySourceNames - The Managed Identity source's name
		*/
		getManagedIdentitySource() {
			return ManagedIdentityClient.sourceName || this.managedIdentityClient.getManagedIdentitySource();
		}
	};
	/**
	* Cache plugin that serializes data to the cache and deserializes data from the cache
	* @public
	*/
	var DistributedCachePlugin = class {
		constructor(client, partitionManager) {
			this.client = client;
			this.partitionManager = partitionManager;
		}
		/**
		* Deserializes the cache before accessing it
		* @param cacheContext - TokenCacheContext
		*/
		async beforeCacheAccess(cacheContext) {
			const partitionKey = await this.partitionManager.getKey();
			const cacheData = await this.client.get(partitionKey);
			cacheContext.tokenCache.deserialize(cacheData);
		}
		/**
		* Serializes the cache after accessing it
		* @param cacheContext - TokenCacheContext
		*/
		async afterCacheAccess(cacheContext) {
			if (cacheContext.cacheHasChanged) {
				const kvStore = cacheContext.tokenCache.getKVStore();
				const accountEntities = Object.values(kvStore).filter((value) => isAccountEntity(value));
				let partitionKey;
				if (accountEntities.length > 0) {
					const accountEntity = accountEntities[0];
					partitionKey = await this.partitionManager.extractKey(accountEntity);
				} else partitionKey = await this.partitionManager.getKey();
				await this.client.set(partitionKey, cacheContext.tokenCache.serialize());
			}
		}
	};
	/**
	* @packageDocumentation
	* @module @azure/msal-node
	*/
	/**
	* Warning: This set of exports is purely intended to be used by other MSAL libraries, and should be considered potentially unstable. We strongly discourage using them directly, you do so at your own risk.
	* Breaking changes to these APIs will be shipped under a minor version, instead of a major version.
	*/
	const PromptValue = PromptValue$1;
	const ResponseMode = ResponseMode$1;
	exports.AuthError = AuthError;
	exports.AuthErrorCodes = AuthErrorCodes;
	exports.AzureCloudInstance = AzureCloudInstance;
	exports.ClientAssertion = ClientAssertion;
	exports.ClientAuthError = ClientAuthError;
	exports.ClientAuthErrorCodes = ClientAuthErrorCodes;
	exports.ClientConfigurationError = ClientConfigurationError;
	exports.ClientConfigurationErrorCodes = ClientConfigurationErrorCodes;
	exports.ConfidentialClientApplication = ConfidentialClientApplication;
	exports.CryptoProvider = CryptoProvider;
	exports.DistributedCachePlugin = DistributedCachePlugin;
	exports.InteractionRequiredAuthError = InteractionRequiredAuthError;
	exports.InteractionRequiredAuthErrorCodes = InteractionRequiredAuthErrorCodes;
	exports.Logger = Logger;
	exports.ManagedIdentityApplication = ManagedIdentityApplication;
	exports.ManagedIdentitySourceNames = ManagedIdentitySourceNames;
	exports.PromptValue = PromptValue;
	exports.ProtocolMode = ProtocolMode;
	exports.PublicClientApplication = PublicClientApplication;
	exports.ResponseMode = ResponseMode;
	exports.ServerError = ServerError;
	exports.TokenCache = TokenCache;
	exports.TokenCacheContext = TokenCacheContext;
	exports.internals = internals;
	exports.version = version;
}));
//#endregion
//#region node_modules/@microsoft/teams.apps/dist/token-manager.js
var require_token_manager = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.TokenManager = void 0;
	const msal_node_1 = require_msal_node();
	const teams_api_1 = require_dist$3();
	const teams_common_1 = require_dist$2();
	const DEFAULT_TENANT_FOR_GRAPH_TOKEN = "common";
	const MSAL_LOG_LEVEL_TO_LOG_LEVEL = {
		[msal_node_1.LogLevel.Error]: "error",
		[msal_node_1.LogLevel.Warning]: "warn",
		[msal_node_1.LogLevel.Info]: "info",
		[msal_node_1.LogLevel.Verbose]: "debug",
		[msal_node_1.LogLevel.Trace]: "trace"
	};
	const LOG_LEVEL_TO_MSAL_LOG_LEVEL = {
		"error": msal_node_1.LogLevel.Error,
		"warn": msal_node_1.LogLevel.Warning,
		"info": msal_node_1.LogLevel.Info,
		"debug": msal_node_1.LogLevel.Verbose,
		"trace": msal_node_1.LogLevel.Trace
	};
	function isClientCredentials(credentials) {
		return "clientSecret" in credentials;
	}
	function isTokenCredentials(credentials) {
		return "token" in credentials;
	}
	function isFederatedIdentityCredentials(credentials) {
		return "managedIdentityType" in credentials;
	}
	var TokenManager = class {
		credentials;
		logger;
		_msalLogger;
		cloud;
		confidentialClientsByTenantId = {};
		managedIdentityClient = null;
		constructor(options, logger) {
			this.logger = logger.child("TokenManager") ?? new teams_common_1.ConsoleLogger("TokenManager");
			this._msalLogger = this.logger.child("azure/msal-node", { pattern: "-azure/msal-node" });
			this.cloud = options.cloud ?? teams_api_1.PUBLIC;
			this.credentials = this.initializeCredentials(options);
		}
		async getBotToken() {
			return await this.getToken(this.cloud.botScope, this.resolveTenantId(void 0, this.cloud.loginTenant));
		}
		async getGraphToken(tenantId) {
			return await this.getToken(this.cloud.graphScope, this.resolveTenantId(tenantId, DEFAULT_TENANT_FOR_GRAPH_TOKEN));
		}
		initializeCredentials(options) {
			const clientId = options.clientId ?? process.env.CLIENT_ID;
			const tenantId = options.tenantId ?? process.env.TENANT_ID;
			const clientSecret = options.clientSecret ?? process.env.CLIENT_SECRET;
			const token = options.token;
			const managedIdentityClientId = options.managedIdentityClientId ?? process.env.MANAGED_IDENTITY_CLIENT_ID;
			if (clientId && clientSecret) {
				this.logger.debug("Using Client Credentials auth");
				return {
					clientId,
					clientSecret,
					tenantId
				};
			} else if (clientId && token) {
				this.logger.debug("Using custom token factory auth");
				return {
					clientId,
					tenantId,
					token
				};
			} else if (clientId && !clientSecret) if (managedIdentityClientId == null || managedIdentityClientId.toLowerCase() === clientId.toLowerCase()) {
				this.logger.debug("Using user managed identity auth");
				return {
					clientId,
					tenantId
				};
			} else {
				const identityType = managedIdentityClientId === "system" ? "system" : "user";
				this.logger.debug(`Using Federated Identity Credentials auth (${identityType})`);
				return {
					clientId,
					tenantId,
					managedIdentityClientId,
					managedIdentityType: identityType
				};
			}
		}
		async getToken(scope, tenantId) {
			if (!this.credentials) return null;
			if (isClientCredentials(this.credentials)) return this.getTokenWithClientCredentials(this.credentials, scope, tenantId);
			else if (isTokenCredentials(this.credentials)) return this.getTokenWithTokenProvider(this.credentials, scope, tenantId);
			else if (isFederatedIdentityCredentials(this.credentials)) return this.getTokenWithFederatedCredentials(this.credentials, scope, tenantId);
			else return this.getTokenWithManagedIdentity(this.credentials, scope);
		}
		async getTokenWithClientCredentials(credentials, scope, tenantId) {
			const result = await this.getConfidentialClient(credentials, tenantId).acquireTokenByClientCredential({ scopes: [scope] });
			return this.handleTokenResponse(result);
		}
		async getTokenWithTokenProvider(credentials, scope, tenantId) {
			const token = await credentials.token(scope, tenantId);
			return new teams_api_1.JsonWebToken(token);
		}
		async getTokenWithManagedIdentity(credentials, scope) {
			const managedIdentityClient = this.getManagedIdentityClient(credentials);
			const resource = scope.replace("/.default", "");
			const result = await managedIdentityClient.acquireToken({ resource });
			return this.handleTokenResponse(result);
		}
		async getTokenWithFederatedCredentials(credentials, scope, tenantId) {
			const managedIdentityTokenRes = await this.getManagedIdentityClient(credentials).acquireToken({ resource: "api://AzureADTokenExchange" });
			const result = await new msal_node_1.ConfidentialClientApplication({
				auth: {
					clientId: credentials.clientId,
					clientAssertion: managedIdentityTokenRes.accessToken,
					authority: `${this.cloud.loginEndpoint}/${tenantId}`
				},
				system: { loggerOptions: this.buildLoggerOptions() }
			}).acquireTokenByClientCredential({ scopes: [scope] });
			return this.handleTokenResponse(result);
		}
		resolveTenantId(tenantId, defaultTenantId) {
			return tenantId || this.credentials?.tenantId || defaultTenantId;
		}
		getConfidentialClient(credentials, tenantId) {
			const cachedClient = this.confidentialClientsByTenantId[tenantId];
			if (cachedClient) return cachedClient;
			const client = new msal_node_1.ConfidentialClientApplication({
				auth: {
					clientId: credentials.clientId,
					clientSecret: credentials.clientSecret,
					authority: `${this.cloud.loginEndpoint}/${tenantId}`
				},
				system: { loggerOptions: this.buildLoggerOptions() }
			});
			this.confidentialClientsByTenantId[tenantId] = client;
			return client;
		}
		getManagedIdentityClient(credentials) {
			if (this.managedIdentityClient) return this.managedIdentityClient;
			if (isFederatedIdentityCredentials(credentials)) if (credentials.managedIdentityType === "user") this.managedIdentityClient = new msal_node_1.ManagedIdentityApplication({
				managedIdentityIdParams: { userAssignedClientId: credentials.managedIdentityClientId },
				system: { loggerOptions: this.buildLoggerOptions() }
			});
			else this.managedIdentityClient = new msal_node_1.ManagedIdentityApplication({
				managedIdentityIdParams: void 0,
				system: { loggerOptions: this.buildLoggerOptions() }
			});
			else this.managedIdentityClient = new msal_node_1.ManagedIdentityApplication({
				managedIdentityIdParams: { userAssignedClientId: credentials.clientId },
				system: { loggerOptions: this.buildLoggerOptions() }
			});
			return this.managedIdentityClient;
		}
		handleTokenResponse(result) {
			if (!result) throw new Error("Failed to get token");
			return new teams_api_1.JsonWebToken(result.accessToken);
		}
		buildLoggerOptions() {
			return {
				logLevel: this.logger.loggerOptions?.level != null ? LOG_LEVEL_TO_MSAL_LOG_LEVEL[this.logger.loggerOptions.level] : void 0,
				loggerCallback: (level, message) => {
					if (message.endsWith("Warning - No client info in response")) return;
					this._msalLogger.log(MSAL_LOG_LEVEL_TO_LOG_LEVEL[level], message);
				},
				piiLoggingEnabled: false
			};
		}
	};
	exports.TokenManager = TokenManager;
}));
//#endregion
//#region node_modules/@microsoft/teams.apps/dist/app.js
var require_app = /* @__PURE__ */ __commonJSMin(((exports) => {
	var __createBinding = exports && exports.__createBinding || (Object.create ? (function(o, m, k, k2) {
		if (k2 === void 0) k2 = k;
		var desc = Object.getOwnPropertyDescriptor(m, k);
		if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) desc = {
			enumerable: true,
			get: function() {
				return m[k];
			}
		};
		Object.defineProperty(o, k2, desc);
	}) : (function(o, m, k, k2) {
		if (k2 === void 0) k2 = k;
		o[k2] = m[k];
	}));
	var __setModuleDefault = exports && exports.__setModuleDefault || (Object.create ? (function(o, v) {
		Object.defineProperty(o, "default", {
			enumerable: true,
			value: v
		});
	}) : function(o, v) {
		o["default"] = v;
	});
	var __importStar = exports && exports.__importStar || (function() {
		var ownKeys = function(o) {
			ownKeys = Object.getOwnPropertyNames || function(o) {
				var ar = [];
				for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
				return ar;
			};
			return ownKeys(o);
		};
		return function(mod) {
			if (mod && mod.__esModule) return mod;
			var result = {};
			if (mod != null) {
				for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
			}
			__setModuleDefault(result, mod);
			return result;
		};
	})();
	var __importDefault = exports && exports.__importDefault || function(mod) {
		return mod && mod.__esModule ? mod : { "default": mod };
	};
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.App = void 0;
	const axios_1 = require_axios();
	const teams_api_1 = require_dist$3();
	const events_1 = require_events$1();
	const http = __importStar(require_http$2());
	const logging_1 = require_logging();
	const storage_1 = require_storage();
	const package_json_1 = __importDefault(require_package());
	const activity_sender_1 = require_activity_sender();
	const api_1 = require_api();
	const app_embed_1 = require_app_embed();
	const app_events_1 = require_app_events();
	const app_oauth_1 = require_app_oauth();
	const app_plugins_1 = require_app_plugins();
	const app_process_1 = require_app_process();
	const app_routing_1 = require_app_routing();
	const container_1 = require_container();
	const http_1 = require_http$1();
	const http_server_1 = require_http_server();
	const middleware = __importStar(require_middleware());
	const oauth_1 = require_oauth();
	const router_1 = require_router();
	const token_manager_1 = require_token_manager();
	const thread_1 = require_thread();
	/**
	* The orchestrator for receiving/sending activities
	*/
	var App = class {
		options;
		api;
		cloud;
		graph;
		log;
		server;
		http;
		client;
		storage;
		entraTokenValidator;
		tokenManager;
		/**
		* Graph API base URL derived from the configured cloud's `graphScope`.
		* Undefined when the scope isn't a URL — `GraphClient` then uses its public-cloud default.
		* Shared across every `GraphClient` the app constructs (`app.graph`, `ctx.appGraph`, `ctx.userGraph`)
		* so sovereign customers get consistent routing.
		*/
		graphBaseUrl;
		/**
		* the apps credentials
		*/
		get credentials() {
			return this.tokenManager.credentials;
		}
		/**
		* the apps id
		*/
		get id() {
			return this.credentials?.clientId;
		}
		/**
		* the apps name
		* @deprecated Name will be removed in the near future. Please remove dependencies from it.
		*/
		get name() {
			return this._manifest.name?.full;
		}
		get oauth() {
			return {
				...oauth_1.DEFAULT_OAUTH_SETTINGS,
				...this.options.oauth
			};
		}
		/**
		* the apps manifest
		*/
		get manifest() {
			return {
				id: this.id,
				name: {
					short: this._manifest.name?.short || "??",
					full: this._manifest.name?.full || "??"
				},
				bots: [{
					botId: this.id || "??",
					scopes: ["personal"]
				}],
				webApplicationInfo: {
					id: this.credentials?.clientId || "??",
					resource: `api://\${{BOT_DOMAIN}}/${this.credentials?.clientId || "??"}`,
					...this._manifest.webApplicationInfo
				},
				...this._manifest
			};
		}
		_manifest;
		container = new container_1.Container();
		plugins = [];
		router = new router_1.Router();
		tenantTokens = new storage_1.LocalStorage({}, { max: 2e4 });
		events = new events_1.EventEmitter();
		isInitialized = false;
		port;
		activitySender;
		_userAgent = `teams.ts[apps]/${package_json_1.default.version}`;
		constructor(options = {}) {
			this.options = options;
			this.log = this.options.logger || new logging_1.ConsoleLogger("@teams/app");
			this.storage = this.options.storage || new storage_1.LocalStorage();
			this._manifest = this.options.manifest || {};
			const cloudEnvName = typeof process !== "undefined" ? process.env.CLOUD : void 0;
			this.cloud = this.options.cloud ?? (cloudEnvName ? (0, teams_api_1.cloudFromName)(cloudEnvName) : teams_api_1.PUBLIC);
			if (!options.client) this.client = new http.Client({ headers: { "User-Agent": this._userAgent } });
			else if (typeof options.client === "function") this.client = options.client().clone({ headers: { "User-Agent": this._userAgent } });
			else if ("request" in options.client) this.client = options.client.clone({ headers: { "User-Agent": this._userAgent } });
			else this.client = new http.Client({
				...options.client,
				headers: {
					...options.client.headers,
					"User-Agent": this._userAgent
				}
			});
			const serviceUrl = (this.options.serviceUrl ?? process.env.SERVICE_URL ?? "https://smba.trafficmanager.net/teams").replace(/\/+$/, "");
			this.api = new api_1.ApiClient(serviceUrl, this.client.clone({ token: () => this.getBotToken() }), this.options.apiClientSettings, this.cloud);
			this.graphBaseUrl = /^(https?:\/\/[^/]+)/i.exec((this.cloud.graphScope ?? "").trim())?.[1];
			if (!this.graphBaseUrl && this.cloud.graphScope) this.log.warn(`graphScope "${this.cloud.graphScope}" is not a URL; Graph calls will route to the public cloud. Set graphScope to an "https://<host>/.default" value to route to the correct Graph endpoint.`);
			this.graph = new api_1.GraphClient(this.client.clone({ token: () => this.getAppGraphToken() }), { baseUrlRoot: this.graphBaseUrl });
			this.tokenManager = new token_manager_1.TokenManager({
				clientId: this.options.clientId,
				clientSecret: this.options.clientSecret,
				tenantId: this.options.tenantId,
				token: this.options.token,
				managedIdentityClientId: this.options.managedIdentityClientId,
				cloud: this.cloud
			}, this.log);
			this.activitySender = new activity_sender_1.ActivitySender(this.client.clone({ token: () => this.getBotToken() }), this.log);
			if (this.credentials?.clientId) this.entraTokenValidator = middleware.createEntraTokenValidator(this.credentials.tenantId || "common", this.credentials.clientId, {
				applicationIdUri: this.options.applicationIdUri,
				loginEndpoint: this.cloud.loginEndpoint,
				logger: this.log
			});
			const plugins = this.options.plugins || [];
			const httpPlugin = plugins.find((p) => {
				return (0, app_plugins_1.getMetadata)(p).name === "http";
			});
			if (this.options.httpServerAdapter && httpPlugin) throw new Error("Cannot provide both httpServerAdapter option and HttpPlugin in plugins array. Use either:\n  - new App({ httpServerAdapter: new ExpressAdapter() }) (recommended)\n  - new App({ plugins: [new HttpPlugin()] }) (deprecated)");
			let server;
			if (httpPlugin) {
				this.log.warn("[DEPRECATED] HttpPlugin in plugins array will be deprecated. Use httpServerAdapter option instead:\n  new App({ httpServerAdapter: new ExpressAdapter() })");
				this.http = httpPlugin;
				server = httpPlugin.asServer?.();
				if (!server) throw new Error("HttpPlugin.asServer() returned undefined");
			} else server = new http_server_1.HttpServer(this.options.httpServerAdapter ?? new http_1.ExpressAdapter(void 0, {
				logger: this.log,
				onError: (err) => this.onError({ error: err })
			}), {
				skipAuth: this.options.skipAuth,
				logger: this.log,
				messagingEndpoint: this.options.messagingEndpoint ?? "/api/messages"
			});
			this.server = server;
			server.onRequest = (event) => this.onActivity(event);
			this.container.register("id", { useValue: this.id });
			this.container.register("name", { useValue: this.name });
			this.container.register("manifest", { useValue: this.manifest });
			this.container.register("credentials", { useValue: this.credentials });
			this.container.register("botToken", { useValue: () => this.getBotToken() });
			this.container.register("ILogger", { useValue: this.log });
			this.container.register("IStorage", { useValue: this.storage });
			this.container.register(this.client.constructor.name, { useFactory: () => this.client });
			this.container.register("IHttpServer", { useValue: server });
			for (const plugin of plugins) this.plugin(plugin);
			if (this.options.activity?.mentions?.stripText) {
				const options = this.options.activity?.mentions?.stripText;
				this.use(middleware.stripMentionsText(typeof options === "boolean" ? {} : options));
			}
			this.router.register({
				name: "signin.token-exchange",
				type: "system",
				select: (activity) => activity.type === "invoke" && activity.name === "signin/tokenExchange",
				callback: (ctx) => this.onTokenExchange(ctx)
			});
			this.router.register({
				name: "signin.verify-state",
				type: "system",
				select: (activity) => activity.type === "invoke" && activity.name === "signin/verifyState",
				callback: (ctx) => this.onVerifyState(ctx)
			});
			this.router.register({
				name: "signin.failure",
				type: "system",
				select: (activity) => activity.type === "invoke" && activity.name === "signin/failure",
				callback: (ctx) => this.onSignInFailure(ctx)
			});
			this.event("error", ({ error }) => {
				this.log.error(error.message);
				if (error instanceof axios_1.AxiosError) {
					this.log.error(error.request.path);
					this.log.error(error.response?.data);
				}
			});
		}
		/**
		* initialize the app.
		*/
		async initialize() {
			if (this.isInitialized) return;
			for (const plugin of this.plugins) {
				this.inject(plugin);
				if (plugin.onInit) await plugin.onInit();
			}
			await this.server.initialize({
				credentials: this.credentials,
				cloud: this.cloud
			});
			this.isInitialized = true;
		}
		/**
		* start the server after initialization
		* @param port port to listen on
		*/
		async start(port) {
			this.port = port || process.env.PORT || 3978;
			try {
				await this.initialize();
				for (const plugin of this.plugins) if (plugin.onStart) await plugin.onStart({ port: this.port });
				this.events.emit("start", this.log);
				await this.server.start(this.port);
			} catch (error) {
				await this.stop();
				this.onError({ error });
			}
		}
		/**
		* stop the app
		*/
		async stop() {
			try {
				for (const plugin of this.plugins) if (plugin.onStop) await plugin.onStop();
				await this.server.stop();
			} catch (error) {
				this.onError({ error });
			}
		}
		/**
		* send an activity proactively to a conversation.
		*
		* Sends to the exact conversation ID provided. For channel threads,
		* the conversation ID must include `;messageid=` - use {@link toThreadedConversationId}
		* to construct it, or use {@link reply} which handles this automatically.
		*
		* @param conversationId the conversation to send to
		* @param activity the activity to send
		*/
		async send(conversationId, activity) {
			if (!this.id) throw new Error("App has no credentials set up");
			const params = (0, teams_api_1.toActivityParams)(activity);
			const ref = {
				channelId: "msteams",
				serviceUrl: this.api.serviceUrl,
				bot: {
					id: this.id,
					name: this.name || this.id,
					role: "bot"
				},
				conversation: { id: conversationId }
			};
			return await this.activitySender.send(params, ref);
		}
		async reply(conversationId, messageId, activity) {
			if (typeof messageId === "string" && activity !== void 0) return this.send((0, thread_1.toThreadedConversationId)(conversationId, messageId), activity);
			return this.send(conversationId, messageId);
		}
		/**
		* subscribe to an event
		* @param name event to subscribe to
		* @param cb callback to invoke
		*/
		on = app_routing_1.on;
		/**
		* subscribe to a message event for a specific pattern
		* @param pattern pattern to match against message text
		* @param cb callback to invoke
		*/
		message = app_routing_1.message;
		/**
		* register a middleware
		* @param cb callback to invoke
		*/
		use = app_routing_1.use;
		/**
		* subscribe to an event
		* @param name the event to subscribe to
		* @param cb the callback to invoke
		*/
		event = app_events_1.event;
		/**
		* add a plugin
		* @param plugin plugin to add
		*/
		plugin = app_plugins_1.plugin;
		/**
		* get a plugin
		*/
		getPlugin = app_plugins_1.getPlugin;
		/**
		* add/update a function that can be called remotely
		* @param name The unique function name
		* @param cb The callback to handle the function
		*/
		function = app_embed_1.func;
		/**
		* add/update a static tab.
		* the tab will be hosted at
		* `http://localhost:{{PORT}}/tabs/{{name}}` or `https://{{BOT_DOMAIN}}/tabs/{{name}}`
		* @remark scopes default to `personal`
		* @param name A unique identifier for the entity which the tab displays.
		* @param path The path to the web `dist` folder.
		*/
		tab = app_embed_1.tab;
		/**
		* add a configurable tab
		* @remark scopes defaults to `team`
		* @param url The url to use when configuring the tab.
		*/
		configTab = app_embed_1.configTab;
		/**
		* activity handler called when an inbound activity is received
		* @param sender the plugin to use for sending activities
		* @param event the received activity event
		*/
		process = app_process_1.$process;
		onTokenExchange = app_oauth_1.onTokenExchange;
		onVerifyState = app_oauth_1.onVerifyState;
		onSignInFailure = app_oauth_1.onSignInFailure;
		inject = app_plugins_1.inject;
		onError = app_events_1.onError;
		onActivitySent = app_events_1.onActivitySent;
		onActivityResponse = app_events_1.onActivityResponse;
		async onActivity(event) {
			this.events.emit("activity", event);
			return await this.process(event);
		}
		async getBotToken() {
			if (!this.tokenManager) return;
			return await this.tokenManager.getBotToken();
		}
		async getUserToken(channelId, userId) {
			return (await this.api.users.token.get({
				channelId,
				userId,
				connectionName: this.oauth.defaultConnectionName
			})).token;
		}
		async getAppGraphToken(tenantId) {
			if (!this.tokenManager) return;
			return await this.tokenManager.getGraphToken(tenantId);
		}
	};
	exports.App = App;
}));
//#endregion
//#region node_modules/@microsoft/teams.apps/dist/plugins/http/plugin.js
var require_plugin = /* @__PURE__ */ __commonJSMin(((exports) => {
	var __decorate = exports && exports.__decorate || function(decorators, target, key, desc) {
		var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
		if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
		else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
		return c > 3 && r && Object.defineProperty(target, key, r), r;
	};
	var __metadata = exports && exports.__metadata || function(k, v) {
		if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
	};
	var __importDefault = exports && exports.__importDefault || function(mod) {
		return mod && mod.__esModule ? mod : { "default": mod };
	};
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.HttpPlugin = void 0;
	const http_1 = __importDefault(__require("http"));
	const cors_1 = __importDefault(require_lib());
	const express_1 = __importDefault(__require("express"));
	const package_json_1 = __importDefault(require_package());
	const http_2 = require_http$1();
	const http_server_1 = require_http_server();
	const types_1 = require_types();
	/**
	* @deprecated Use the httpServerAdapter option instead:
	*   new App({ httpServerAdapter: new ExpressAdapter() })
	*
	* This wrapper will be removed in a future version.
	*
	* NOTE: This plugin is named "HttpPlugin" for historical reasons and backwards compatibility.
	* It is the default HTTP plugin that uses Express as the underlying framework.
	*/
	let HttpPlugin = class HttpPlugin {
		get;
		post;
		patch;
		put;
		delete;
		route;
		use;
		expressAdapter;
		server;
		constructor(server, options) {
			this.expressAdapter = new http_2.ExpressAdapter(server);
			this.server = new http_server_1.HttpServer(this.expressAdapter, {
				...options,
				messagingEndpoint: options?.messagingEndpoint ?? "/api/messages"
			});
			this.get = this.expressAdapter.get;
			this.post = this.expressAdapter.post;
			this.patch = this.expressAdapter.patch;
			this.put = this.expressAdapter.put;
			this.delete = this.expressAdapter.delete;
			this.route = this.expressAdapter.route;
			this.use = this.expressAdapter.use;
		}
		/**
		* App.constructor calls this to extract the HttpServer
		* @internal
		*/
		asServer() {
			return this.server;
		}
		/**
		* Plugin lifecycle hook
		*/
		async onInit() {
			this.use((0, cors_1.default)());
			this.use("/api", express_1.default.json());
		}
		/**
		* serve static files
		* @param path the url path to serve
		* @param dist the dist file path to serve
		*/
		static(path, dist) {
			this.expressAdapter.serveStatic(path, dist);
			return this;
		}
	};
	exports.HttpPlugin = HttpPlugin;
	exports.HttpPlugin = HttpPlugin = __decorate([(0, types_1.Plugin)({
		name: "http",
		version: package_json_1.default.version,
		description: "Deprecated: Use httpServerAdapter option instead"
	}), __metadata("design:paramtypes", [http_1.default.Server, Object])], HttpPlugin);
}));
//#endregion
//#region node_modules/@microsoft/teams.apps/dist/plugins/http/index.js
var require_http = /* @__PURE__ */ __commonJSMin(((exports) => {
	var __createBinding = exports && exports.__createBinding || (Object.create ? (function(o, m, k, k2) {
		if (k2 === void 0) k2 = k;
		var desc = Object.getOwnPropertyDescriptor(m, k);
		if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) desc = {
			enumerable: true,
			get: function() {
				return m[k];
			}
		};
		Object.defineProperty(o, k2, desc);
	}) : (function(o, m, k, k2) {
		if (k2 === void 0) k2 = k;
		o[k2] = m[k];
	}));
	var __exportStar = exports && exports.__exportStar || function(m, exports$3) {
		for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports$3, p)) __createBinding(exports$3, m, p);
	};
	Object.defineProperty(exports, "__esModule", { value: true });
	__exportStar(require_plugin(), exports);
}));
//#endregion
//#region node_modules/@microsoft/teams.apps/dist/plugins/index.js
var require_plugins = /* @__PURE__ */ __commonJSMin(((exports) => {
	var __createBinding = exports && exports.__createBinding || (Object.create ? (function(o, m, k, k2) {
		if (k2 === void 0) k2 = k;
		var desc = Object.getOwnPropertyDescriptor(m, k);
		if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) desc = {
			enumerable: true,
			get: function() {
				return m[k];
			}
		};
		Object.defineProperty(o, k2, desc);
	}) : (function(o, m, k, k2) {
		if (k2 === void 0) k2 = k;
		o[k2] = m[k];
	}));
	var __exportStar = exports && exports.__exportStar || function(m, exports$2) {
		for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports$2, p)) __createBinding(exports$2, m, p);
	};
	Object.defineProperty(exports, "__esModule", { value: true });
	__exportStar(require_http(), exports);
}));
//#endregion
//#region node_modules/@microsoft/teams.apps/dist/manifest.js
var require_manifest = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
}));
//#endregion
//#region node_modules/@microsoft/teams.apps/dist/index.js
var require_dist = /* @__PURE__ */ __commonJSMin(((exports) => {
	var __createBinding = exports && exports.__createBinding || (Object.create ? (function(o, m, k, k2) {
		if (k2 === void 0) k2 = k;
		var desc = Object.getOwnPropertyDescriptor(m, k);
		if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) desc = {
			enumerable: true,
			get: function() {
				return m[k];
			}
		};
		Object.defineProperty(o, k2, desc);
	}) : (function(o, m, k, k2) {
		if (k2 === void 0) k2 = k;
		o[k2] = m[k];
	}));
	var __setModuleDefault = exports && exports.__setModuleDefault || (Object.create ? (function(o, v) {
		Object.defineProperty(o, "default", {
			enumerable: true,
			value: v
		});
	}) : function(o, v) {
		o["default"] = v;
	});
	var __exportStar = exports && exports.__exportStar || function(m, exports$1) {
		for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports$1, p)) __createBinding(exports$1, m, p);
	};
	var __importStar = exports && exports.__importStar || (function() {
		var ownKeys = function(o) {
			ownKeys = Object.getOwnPropertyNames || function(o) {
				var ar = [];
				for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
				return ar;
			};
			return ownKeys(o);
		};
		return function(mod) {
			if (mod && mod.__esModule) return mod;
			var result = {};
			if (mod != null) {
				for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
			}
			__setModuleDefault(result, mod);
			return result;
		};
	})();
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.toThreadedConversationId = exports.manifest = void 0;
	__exportStar(require_app(), exports);
	__exportStar(require_plugins(), exports);
	__exportStar(require_types(), exports);
	__exportStar(require_contexts(), exports);
	__exportStar(require_oauth(), exports);
	__exportStar(require_events(), exports);
	exports.manifest = __importStar(require_manifest());
	__exportStar(require_http$1(), exports);
	var thread_1 = require_thread();
	Object.defineProperty(exports, "toThreadedConversationId", {
		enumerable: true,
		get: function() {
			return thread_1.toThreadedConversationId;
		}
	});
}));
//#endregion
export default require_dist();
export {};
