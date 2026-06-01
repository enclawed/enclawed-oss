//#region node_modules/typebox/build/system/memory/metrics.mjs
/** TypeBox instantiation metrics */
const Metrics = {
	assign: 0,
	create: 0,
	clone: 0,
	discard: 0,
	update: 0
};
//#endregion
//#region node_modules/typebox/build/system/memory/assign.mjs
/**
* Performs an Object assign using the Left and Right object types. We track this operation as it
* creates a new GC handle per assignment.
*/
function Assign(left, right) {
	Metrics.assign += 1;
	return {
		...left,
		...right
	};
}
//#endregion
//#region node_modules/typebox/build/guard/string.mjs
function IsBetween(value, min, max) {
	return value >= min && value <= max;
}
function IsRegionalIndicator(value) {
	return IsBetween(value, 127462, 127487);
}
function IsVariationSelector(value) {
	return IsBetween(value, 65024, 65039);
}
function IsCombiningMark(value) {
	return IsBetween(value, 768, 879) || IsBetween(value, 6832, 6911) || IsBetween(value, 7616, 7679) || IsBetween(value, 65056, 65071);
}
function CodePointLength(value) {
	return value > 65535 ? 2 : 1;
}
function ConsumeModifiers(value, index) {
	while (index < value.length) {
		const point = value.codePointAt(index);
		if (IsCombiningMark(point) || IsVariationSelector(point)) index += CodePointLength(point);
		else break;
	}
	return index;
}
function NextGraphemeClusterIndex(value, clusterStart) {
	const startCP = value.codePointAt(clusterStart);
	let clusterEnd = clusterStart + CodePointLength(startCP);
	clusterEnd = ConsumeModifiers(value, clusterEnd);
	while (clusterEnd < value.length - 1 && value[clusterEnd] === "‍") {
		const nextCP = value.codePointAt(clusterEnd + 1);
		clusterEnd += 1 + CodePointLength(nextCP);
		clusterEnd = ConsumeModifiers(value, clusterEnd);
	}
	if (IsRegionalIndicator(startCP) && clusterEnd < value.length && IsRegionalIndicator(value.codePointAt(clusterEnd))) clusterEnd += CodePointLength(value.codePointAt(clusterEnd));
	return clusterEnd;
}
function IsGraphemeCodePoint(value) {
	return IsBetween(value, 55296, 56319) || IsBetween(value, 768, 879) || value === 8205;
}
/** Checks if a string has at least a minimum number of grapheme clusters */
function IsMinLength$1(value, minLength) {
	if (minLength === 0) return true;
	let count = 0;
	let index = 0;
	while (index < value.length) {
		index = NextGraphemeClusterIndex(value, index);
		count++;
		if (count >= minLength) return true;
	}
	return false;
}
/** Checks if a string has at most a maximum number of grapheme clusters */
function IsMaxLength$1(value, maxLength) {
	let count = 0;
	let index = 0;
	while (index < value.length) {
		index = NextGraphemeClusterIndex(value, index);
		count++;
		if (count > maxLength) return false;
	}
	return true;
}
/** Fast check for minimum grapheme length, falls back to full check if needed */
function IsMinLengthFast(value, minLength) {
	if (minLength === 0) return true;
	let index = 0;
	while (index < value.length) {
		if (IsGraphemeCodePoint(value.charCodeAt(index))) return IsMinLength$1(value, minLength);
		index++;
		if (index >= minLength) return true;
	}
	return false;
}
/** Fast check for maximum grapheme length, falls back to full check if needed */
function IsMaxLengthFast(value, maxLength) {
	let index = 0;
	while (index < value.length) {
		if (IsGraphemeCodePoint(value.charCodeAt(index))) return IsMaxLength$1(value, maxLength);
		index++;
		if (index > maxLength) return false;
	}
	return true;
}
//#endregion
//#region node_modules/typebox/build/guard/guard.mjs
/** Returns true if this value is an array */
function IsArray$1(value) {
	return Array.isArray(value);
}
/** Returns true if this value is an async iterator */
function IsAsyncIterator$1(value) {
	return IsObject$1(value) && Symbol.asyncIterator in value;
}
/** Returns true if this value is bigint */
function IsBigInt$1(value) {
	return IsEqual(typeof value, "bigint");
}
/** Returns true if this value is a boolean */
function IsBoolean$2(value) {
	return IsEqual(typeof value, "boolean");
}
/** Returns true if this value is a constructor */
function IsConstructor$1(value) {
	if (IsUndefined$1(value) || !IsFunction$1(value)) return false;
	const result = Function.prototype.toString.call(value);
	if (/^class\s/.test(result)) return true;
	if (/\[native code\]/.test(result)) return true;
	return false;
}
/** Returns true if this value is a function */
function IsFunction$1(value) {
	return IsEqual(typeof value, "function");
}
/** Returns true if this value is integer */
function IsInteger$1(value) {
	return Number.isInteger(value);
}
/** Returns true if this value is an iterator */
function IsIterator$1(value) {
	return IsObject$1(value) && Symbol.iterator in value;
}
/** Returns true if this value is null */
function IsNull$1(value) {
	return IsEqual(value, null);
}
/** Returns true if this value is number */
function IsNumber$2(value) {
	return Number.isFinite(value);
}
/** Returns true if this value is an object but not an array */
function IsObjectNotArray(value) {
	return IsObject$1(value) && !IsArray$1(value);
}
/** Returns true if this value is an object */
function IsObject$1(value) {
	return IsEqual(typeof value, "object") && !IsNull$1(value);
}
/** Returns true if this value is string */
function IsString$2(value) {
	return IsEqual(typeof value, "string");
}
/** Returns true if this value is symbol */
function IsSymbol$1(value) {
	return IsEqual(typeof value, "symbol");
}
/** Returns true if this value is undefined */
function IsUndefined$1(value) {
	return IsEqual(value, void 0);
}
function IsEqual(left, right) {
	return left === right;
}
function IsGreaterThan(left, right) {
	return left > right;
}
function IsLessThan(left, right) {
	return left < right;
}
function IsLessEqualThan(left, right) {
	return left <= right;
}
function IsGreaterEqualThan(left, right) {
	return left >= right;
}
function IsMultipleOf(dividend, divisor) {
	if (IsBigInt$1(dividend) || IsBigInt$1(divisor)) return BigInt(dividend) % BigInt(divisor) === 0n;
	const tolerance = 1e-10;
	if (!IsNumber$2(dividend)) return true;
	if (IsInteger$1(dividend) && 1 / divisor % 1 === 0) return true;
	const mod = dividend % divisor;
	return Math.min(Math.abs(mod), Math.abs(mod - divisor)) < tolerance;
}
/** Returns true if the value appears to be an instance of a class. */
function IsClassInstance(value) {
	if (!IsObject$1(value)) return false;
	const proto = globalThis.Object.getPrototypeOf(value);
	if (IsNull$1(proto)) return false;
	return IsEqual(typeof proto.constructor, "function") && !(IsEqual(proto.constructor, globalThis.Object) || IsEqual(proto.constructor.name, "Object"));
}
function IsValueLike(value) {
	return IsBigInt$1(value) || IsBoolean$2(value) || IsNull$1(value) || IsNumber$2(value) || IsString$2(value) || IsUndefined$1(value);
}
/** Returns true if the string has at most the given number of graphemes */
function IsMaxLength(value, length) {
	return IsMaxLengthFast(value, length);
}
/** Returns true if the string has at least the given number of graphemes */
function IsMinLength(value, length) {
	return IsMinLengthFast(value, length);
}
/** Returns true if all elements from offset satisfy the callback, short-circuiting on the first failure */
function Every(value, offset, callback) {
	for (let index = offset; index < value.length; index++) if (!callback(value[index], index)) return false;
	return true;
}
/** Returns true if all elements from offset satisfy the callback, visiting every element regardless of failure */
function EveryAll(value, offset, callback) {
	let result = true;
	for (let index = offset; index < value.length; index++) if (!callback(value[index], index)) result = false;
	return result;
}
/** Takes the left-most element from an array and dispatches to the true arm, or the false arm if empty */
function TakeLeft(array, true_, false_) {
	return IsEqual(array.length, 0) ? false_() : true_(array[0], array.slice(1));
}
/** Returns true if the PropertyKey is Unsafe (ref: prototype-pollution). */
function IsUnsafePropertyKey(key) {
	return IsEqual(key, "__proto__") || IsEqual(key, "constructor") || IsEqual(key, "prototype");
}
/** Returns true if this value has this property key */
function HasPropertyKey(value, key) {
	return IsUnsafePropertyKey(key) ? Object.prototype.hasOwnProperty.call(value, key) : key in value;
}
/** Returns object entries as `[RegExp, Value][]` */
function EntriesRegExp(value) {
	return Keys(value).map((key) => [new RegExp(`^${key}$`), value[key]]);
}
/** Returns object entries as `[string, Value][]` */
function Entries(value) {
	return Object.entries(value);
}
/** Returns property keys for this object via `Object.getOwnPropertyKeys({ ... })` */
function Keys(value) {
	return Object.getOwnPropertyNames(value);
}
/** Returns the property keys for this object via `Object.getOwnPropertyKeys({ ... })` */
function Symbols(value) {
	return Object.getOwnPropertySymbols(value);
}
/** Returns the property values for the given object via `Object.values()` */
function Values(value) {
	return Object.values(value);
}
function DeepEqualObject(left, right) {
	if (!IsObject$1(right)) return false;
	const keys = Keys(left);
	return IsEqual(keys.length, Keys(right).length) && keys.every((key) => IsDeepEqual(left[key], right[key]));
}
function DeepEqualArray(left, right) {
	return IsArray$1(right) && IsEqual(left.length, right.length) && left.every((_, index) => IsDeepEqual(left[index], right[index]));
}
/** Tests values for deep equality */
function IsDeepEqual(left, right) {
	return IsArray$1(left) ? DeepEqualArray(left, right) : IsObject$1(left) ? DeepEqualObject(left, right) : IsEqual(left, right);
}
//#endregion
//#region node_modules/typebox/build/guard/globals.mjs
function IsBoolean$1(value) {
	return value instanceof Boolean;
}
function IsNumber$1(value) {
	return value instanceof Number;
}
function IsString$1(value) {
	return value instanceof String;
}
function IsTypeArray(value) {
	return globalThis.ArrayBuffer.isView(value);
}
/** Returns true if the value is a RegExp */
function IsRegExp(value) {
	return value instanceof globalThis.RegExp;
}
/** Returns true if the value is a Date */
function IsDate(value) {
	return value instanceof globalThis.Date;
}
/** Returns true if the value is a Set */
function IsSet(value) {
	return value instanceof globalThis.Set;
}
/** Returns true if the value is a Map */
function IsMap(value) {
	return value instanceof globalThis.Map;
}
//#endregion
//#region node_modules/typebox/build/system/memory/clone.mjs
function IsGuard(value) {
	return IsObject$1(value) && HasPropertyKey(value, "~guard");
}
function FromGuard(value) {
	return value;
}
function FromArray$4(value) {
	return value.map((value) => FromValue$1(value));
}
function FromObject$7(value) {
	const result = {};
	const descriptors = Object.getOwnPropertyDescriptors(value);
	for (const key of Object.keys(descriptors)) {
		const descriptor = descriptors[key];
		if (HasPropertyKey(descriptor, "value")) Object.defineProperty(result, key, {
			...descriptor,
			value: FromValue$1(descriptor.value)
		});
	}
	return result;
}
function FromRegExp$1(value) {
	return new RegExp(value.source, value.flags);
}
function FromUnknown(value) {
	return value;
}
function FromValue$1(value) {
	return value instanceof RegExp ? FromRegExp$1(value) : IsGuard(value) ? FromGuard(value) : IsArray$1(value) ? FromArray$4(value) : IsObject$1(value) ? FromObject$7(value) : FromUnknown(value);
}
/**
* Clones a value using the TypeBox type cloning strategy. This function preserves non-enumerable
* properties from the source value. This is to ensure cloned types retain discriminable
* hidden properties.
*/
function Clone(value) {
	Metrics.clone += 1;
	return FromValue$1(value);
}
//#endregion
//#region node_modules/typebox/build/system/settings/settings.mjs
const settings = {
	immutableTypes: false,
	maxErrors: 8,
	useAcceleration: true,
	exactOptionalPropertyTypes: false,
	enumerableKind: false,
	correctiveParse: false
};
/** Gets current system settings */
function Get() {
	return settings;
}
//#endregion
//#region node_modules/typebox/build/system/memory/create.mjs
function MergeHidden(left, right) {
	for (const key of Object.keys(right)) Object.defineProperty(left, key, {
		configurable: true,
		writable: true,
		enumerable: false,
		value: right[key]
	});
	return left;
}
function Merge(left, right) {
	return {
		...left,
		...right
	};
}
/**
* Creates an object with hidden, enumerable, and optional property sets. This function
* ensures types are instantiated according to configuration rules for enumerable and
* non-enumerable properties.
*/
function Create(hidden, enumerable, options = {}) {
	Metrics.create += 1;
	const settings = Get();
	const withOptions = Merge(enumerable, options);
	const withHidden = settings.enumerableKind ? Merge(withOptions, hidden) : MergeHidden(withOptions, hidden);
	return settings.immutableTypes ? Object.freeze(withHidden) : withHidden;
}
//#endregion
//#region node_modules/typebox/build/system/memory/discard.mjs
/** Discards multiple property keys from the given object value */
function Discard(value, propertyKeys) {
	Metrics.discard += 1;
	const result = {};
	const descriptors = Object.getOwnPropertyDescriptors(Clone(value));
	const keysToDiscard = new Set(propertyKeys);
	for (const key of Object.keys(descriptors)) {
		if (keysToDiscard.has(key)) continue;
		Object.defineProperty(result, key, descriptors[key]);
	}
	return result;
}
//#endregion
//#region node_modules/typebox/build/system/memory/update.mjs
/**
* Updates a value with new properties while preserving property enumerability. Use this function to modify
* existing types without altering their configuration.
*/
function Update(current, hidden, enumerable) {
	Metrics.update += 1;
	const settings = Get();
	const result = Clone(current);
	for (const key of Object.keys(hidden)) Object.defineProperty(result, key, {
		configurable: true,
		writable: true,
		enumerable: settings.enumerableKind,
		value: hidden[key]
	});
	for (const key of Object.keys(enumerable)) Object.defineProperty(result, key, {
		configurable: true,
		enumerable: true,
		writable: true,
		value: enumerable[key]
	});
	return result;
}
//#endregion
//#region node_modules/typebox/build/type/types/schema.mjs
function IsKind(value, kind) {
	return IsObject$1(value) && HasPropertyKey(value, "~kind") && IsEqual(value["~kind"], kind);
}
function IsSchema(value) {
	return IsObject$1(value);
}
//#endregion
//#region node_modules/typebox/build/type/action/_optional.mjs
/** Returns true if this value is a OptionalAddAction. */
function IsOptionalAddAction(value) {
	return IsObject$1(value) && HasPropertyKey(value, "~kind") && HasPropertyKey(value, "type") && IsEqual(value["~kind"], "OptionalAddAction") && IsSchema(value.type);
}
/** Returns true if this value is a OptionalRemoveAction. */
function IsOptionalRemoveAction(value) {
	return IsObject$1(value) && HasPropertyKey(value, "~kind") && HasPropertyKey(value, "type") && IsEqual(value["~kind"], "OptionalRemoveAction") && IsSchema(value.type);
}
//#endregion
//#region node_modules/typebox/build/type/action/_readonly.mjs
/** Returns true if this value is a ReadonlyAddAction. */
function IsReadonlyAddAction(value) {
	return IsObject$1(value) && HasPropertyKey(value, "~kind") && HasPropertyKey(value, "type") && IsEqual(value["~kind"], "ReadonlyAddAction") && IsSchema(value.type);
}
/** Returns true if this value is a ReadonlyRemoveAction. */
function IsReadonlyRemoveAction(value) {
	return IsObject$1(value) && HasPropertyKey(value, "~kind") && HasPropertyKey(value, "type") && IsEqual(value["~kind"], "ReadonlyRemoveAction") && IsSchema(value.type);
}
//#endregion
//#region node_modules/typebox/build/type/types/deferred.mjs
/** Creates a Deferred action. */
function Deferred(action, parameters, options) {
	return Create({ "~kind": "Deferred" }, {
		action,
		parameters,
		options
	}, {});
}
/** Returns true if the given value is a TDeferred. */
function IsDeferred(value) {
	return IsKind(value, "Deferred");
}
//#endregion
//#region node_modules/typebox/build/type/types/promise.mjs
/**
* Creates a Promise type.
*
* @deprecated This type is being removed in the next version of TypeBox. A fallback will be provided under examples.
*/
function _Promise_(item, options) {
	return Create({ ["~kind"]: "Promise" }, {
		type: "promise",
		item
	}, options);
}
/** Returns true if the given type is TPromise. */
function IsPromise(value) {
	return IsKind(value, "Promise");
}
/** Extracts options from a TPromise. */
function PromiseOptions(type) {
	return Discard(type, [
		"~kind",
		"type",
		"item"
	]);
}
//#endregion
//#region node_modules/typebox/build/type/types/_immutable.mjs
/** Adds Immutable to the given type. */
function ImmutableAdd(type) {
	return Update(type, { "~immutable": true }, {});
}
/** Applies an Immutable modifier to the given type. */
function Immutable(type) {
	return ImmutableAdd(type);
}
/** Returns true if the given value is a TImmutable */
function IsImmutable(value) {
	return IsSchema(value) && HasPropertyKey(value, "~immutable");
}
//#endregion
//#region node_modules/typebox/build/type/types/_optional.mjs
/** Removes Optional from the given type. */
function OptionalRemove(type) {
	return Discard(type, ["~optional"]);
}
/** Adds Optional to the given type. */
function OptionalAdd(type) {
	return Update(type, { "~optional": true }, {});
}
/** Applies an Optional modifier to the given type. */
function Optional(type) {
	return OptionalAdd(type);
}
/** Returns true if the given value is TOptional */
function IsOptional(value) {
	return IsSchema(value) && HasPropertyKey(value, "~optional");
}
//#endregion
//#region node_modules/typebox/build/type/types/_readonly.mjs
/** Removes a Readonly property modifier from the given type. */
function ReadonlyRemove(type) {
	return Discard(type, ["~readonly"]);
}
/** Adds a Readonly property modifier to the given type. */
function ReadonlyAdd(type) {
	return Update(type, { "~readonly": true }, {});
}
/** Applies an Readonly property modifier to the given type. */
function Readonly(type) {
	return ReadonlyAdd(type);
}
/** Returns true if the given value is a TReadonly */
function IsReadonly(value) {
	return IsSchema(value) && HasPropertyKey(value, "~readonly");
}
//#endregion
//#region node_modules/typebox/build/type/types/base.mjs
/** Returns true if the given value is a Base type. */
function IsBase(value) {
	return IsKind(value, "Base");
}
//#endregion
//#region node_modules/typebox/build/type/types/array.mjs
/** Creates an Array type. */
function _Array_(items, options) {
	return Create({ "~kind": "Array" }, {
		type: "array",
		items
	}, options);
}
/** Returns true if the given value is a TArray. */
function IsArray(value) {
	return IsKind(value, "Array");
}
/** Extracts options from a TArray. */
function ArrayOptions(type) {
	return Discard(type, [
		"~kind",
		"type",
		"items"
	]);
}
//#endregion
//#region node_modules/typebox/build/type/types/async_iterator.mjs
/**
* Creates a AsyncIterator type.
*
* @deprecated This type is being removed in the next version of TypeBox. A fallback will be provided under examples.
*/
function AsyncIterator(iteratorItems, options) {
	return Create({ "~kind": "AsyncIterator" }, {
		type: "asyncIterator",
		iteratorItems
	}, options);
}
/** Returns true if the given value is a TAsyncIterator */
function IsAsyncIterator(value) {
	return IsKind(value, "AsyncIterator");
}
/** Extracts options from a TAsyncIterator. */
function AsyncIteratorOptions(type) {
	return Discard(type, [
		"~kind",
		"type",
		"iteratorItems"
	]);
}
//#endregion
//#region node_modules/typebox/build/type/types/constructor.mjs
/** Creates a Constructor type. */
function Constructor(parameters, instanceType, options = {}) {
	return Create({ "~kind": "Constructor" }, {
		type: "constructor",
		parameters,
		instanceType
	}, options);
}
/** Returns true if the given value is a TConstructor. */
function IsConstructor(value) {
	return IsKind(value, "Constructor");
}
/** Extracts options from a TConstructor. */
function ConstructorOptions(type) {
	return Discard(type, [
		"~kind",
		"type",
		"parameters",
		"instanceType"
	]);
}
//#endregion
//#region node_modules/typebox/build/type/types/function.mjs
/** Creates a Function type. */
function _Function_(parameters, returnType, options = {}) {
	return Create({ ["~kind"]: "Function" }, {
		type: "function",
		parameters,
		returnType
	}, options);
}
/** Returns true if the given value is TFunction. */
function IsFunction(value) {
	return IsKind(value, "Function");
}
/** Extracts options from a TFunction. */
function FunctionOptions(type) {
	return Discard(type, [
		"~kind",
		"type",
		"parameters",
		"returnType"
	]);
}
//#endregion
//#region node_modules/typebox/build/type/types/ref.mjs
/** Creates a Ref type. */
function Ref(ref, options) {
	return Create({ ["~kind"]: "Ref" }, { $ref: ref }, options);
}
/** Returns true if the given value is TRef. */
function IsRef(value) {
	return IsKind(value, "Ref");
}
//#endregion
//#region node_modules/typebox/build/type/types/generic.mjs
/** Creates a Generic type. */
function Generic(parameters, expression) {
	return Create({ "~kind": "Generic" }, {
		type: "generic",
		parameters,
		expression
	});
}
/** Returns true if the given value is a TGeneric. */
function IsGeneric(value) {
	return IsKind(value, "Generic");
}
//#endregion
//#region node_modules/typebox/build/type/types/any.mjs
/** Creates a Any type. */
function Any(options) {
	return Create({ ["~kind"]: "Any" }, {}, options);
}
/** Returns true if the given value is a TAny. */
function IsAny(value) {
	return IsKind(value, "Any");
}
//#endregion
//#region node_modules/typebox/build/type/types/never.mjs
const NeverPattern = "(?!)";
/** Creates a Never type. */
function Never(options) {
	return Create({ "~kind": "Never" }, { not: {} }, options);
}
/** Returns true if the given value is TNever. */
function IsNever(value) {
	return IsKind(value, "Never");
}
//#endregion
//#region node_modules/typebox/build/type/types/properties.mjs
/** Creates a RequiredArray derived from the given TProperties value. */
function RequiredArray(properties) {
	return Keys(properties).filter((key) => !IsOptional(properties[key]));
}
/** Extracts a tuple of keys from a TProperties value. */
function PropertyKeys(properties) {
	return Keys(properties);
}
/** Extracts a tuple of property values from a TProperties value. */
function PropertyValues(properties) {
	return Values(properties);
}
//#endregion
//#region node_modules/typebox/build/type/types/object.mjs
/** Creates an Object type. */
function _Object_(properties, options = {}) {
	const requiredKeys = RequiredArray(properties);
	const required = requiredKeys.length > 0 ? { required: requiredKeys } : {};
	return Create({ "~kind": "Object" }, {
		type: "object",
		...required,
		properties
	}, options);
}
/** Returns true if the given value is TObject. */
function IsObject(value) {
	return IsKind(value, "Object");
}
/** Extracts options from a TObject. */
function ObjectOptions(type) {
	return Discard(type, [
		"~kind",
		"type",
		"properties",
		"required"
	]);
}
//#endregion
//#region node_modules/typebox/build/type/types/union.mjs
/** Creates a Union type. */
function Union(anyOf, options = {}) {
	return Create({ "~kind": "Union" }, { anyOf }, options);
}
/** Returns true if the given value is TUnion. */
function IsUnion(value) {
	return IsKind(value, "Union");
}
/** Extracts options from a TUnion. */
function UnionOptions(type) {
	return Discard(type, ["~kind", "anyOf"]);
}
//#endregion
//#region node_modules/typebox/build/type/types/unknown.mjs
/** Creates an Unknown type. */
function Unknown(options) {
	return Create({ ["~kind"]: "Unknown" }, {}, options);
}
/** Returns true if the given value is TUnknown. */
function IsUnknown(value) {
	return IsKind(value, "Unknown");
}
//#endregion
//#region node_modules/typebox/build/type/types/cyclic.mjs
/** Creates a Cyclic type. */
function Cyclic($defs, $ref, options) {
	const defs = Keys($defs).reduce((result, key) => {
		return {
			...result,
			[key]: Update($defs[key], {}, { $id: key })
		};
	}, {});
	return Create({ ["~kind"]: "Cyclic" }, {
		$defs: defs,
		$ref
	}, options);
}
/** Returns true if the given value is a TCyclic. */
function IsCyclic(value) {
	return IsKind(value, "Cyclic");
}
//#endregion
//#region node_modules/typebox/build/type/types/unsafe.mjs
/** Creates a Unsafe type. */
function Unsafe(schema) {
	return Update(schema, { ["~unsafe"]: null }, {});
}
/** Returns true if the given value is TUnsafe. */
function IsUnsafe(value) {
	return IsObjectNotArray(value) && HasPropertyKey(value, "~unsafe") && IsNull$1(value["~unsafe"]);
}
//#endregion
//#region node_modules/typebox/build/type/types/infer.mjs
/** Returns true if the given value is TInfer. */
function IsInfer(value) {
	return IsKind(value, "Infer");
}
//#endregion
//#region node_modules/typebox/build/type/types/enum.mjs
/** Returns true if the given value is a TEnum. */
function IsEnum(value) {
	return IsKind(value, "Enum");
}
//#endregion
//#region node_modules/typebox/build/type/types/intersect.mjs
/** Creates a Intersect type. */
function Intersect(types, options = {}) {
	return Create({ "~kind": "Intersect" }, { allOf: types }, options);
}
/** Returns true if the given value is TIntersect. */
function IsIntersect(value) {
	return IsKind(value, "Intersect");
}
/** Extracts options from a TIntersect. */
function IntersectOptions(type) {
	return Discard(type, ["~kind", "allOf"]);
}
//#endregion
//#region node_modules/typebox/build/system/unreachable/unreachable.mjs
/** Used for unreachable logic */
function Unreachable() {
	throw new Error("Unreachable");
}
//#endregion
//#region node_modules/typebox/build/system/hashing/hash.mjs
function InstanceKeys(value) {
	const propertyKeys = /* @__PURE__ */ new Set();
	let current = value;
	while (current && current !== Object.prototype) {
		for (const key of Reflect.ownKeys(current)) if (key !== "constructor" && typeof key !== "symbol") propertyKeys.add(key);
		current = Object.getPrototypeOf(current);
	}
	return [...propertyKeys];
}
function IsIEEE754(value) {
	return typeof value === "number";
}
var ByteMarker;
(function(ByteMarker) {
	ByteMarker[ByteMarker["Array"] = 0] = "Array";
	ByteMarker[ByteMarker["BigInt"] = 1] = "BigInt";
	ByteMarker[ByteMarker["Boolean"] = 2] = "Boolean";
	ByteMarker[ByteMarker["Date"] = 3] = "Date";
	ByteMarker[ByteMarker["Constructor"] = 4] = "Constructor";
	ByteMarker[ByteMarker["Function"] = 5] = "Function";
	ByteMarker[ByteMarker["Null"] = 6] = "Null";
	ByteMarker[ByteMarker["Number"] = 7] = "Number";
	ByteMarker[ByteMarker["Object"] = 8] = "Object";
	ByteMarker[ByteMarker["RegExp"] = 9] = "RegExp";
	ByteMarker[ByteMarker["String"] = 10] = "String";
	ByteMarker[ByteMarker["Symbol"] = 11] = "Symbol";
	ByteMarker[ByteMarker["TypeArray"] = 12] = "TypeArray";
	ByteMarker[ByteMarker["Undefined"] = 13] = "Undefined";
})(ByteMarker || (ByteMarker = {}));
let Accumulator = BigInt("14695981039346656037");
const [Prime, Size] = [BigInt("1099511628211"), BigInt("18446744073709551616")];
const Bytes = Array.from({ length: 256 }).map((_, i) => BigInt(i));
const F64 = new Float64Array(1);
const F64In = new DataView(F64.buffer);
const F64Out = new Uint8Array(F64.buffer);
function FNV1A64_OP(byte) {
	Accumulator = Accumulator ^ Bytes[byte];
	Accumulator = Accumulator * Prime % Size;
}
function FromArray$3(value) {
	FNV1A64_OP(ByteMarker.Array);
	for (const item of value) FromValue(item);
}
function FromBigInt(value) {
	FNV1A64_OP(ByteMarker.BigInt);
	F64In.setBigInt64(0, value);
	for (const byte of F64Out) FNV1A64_OP(byte);
}
function FromBoolean(value) {
	FNV1A64_OP(ByteMarker.Boolean);
	FNV1A64_OP(value ? 1 : 0);
}
function FromConstructor(value) {
	FNV1A64_OP(ByteMarker.Constructor);
	FromValue(value.toString());
}
function FromDate(value) {
	FNV1A64_OP(ByteMarker.Date);
	FromValue(value.getTime());
}
function FromFunction(value) {
	FNV1A64_OP(ByteMarker.Function);
	FromValue(value.toString());
}
function FromNull(_value) {
	FNV1A64_OP(ByteMarker.Null);
}
function FromNumber(value) {
	FNV1A64_OP(ByteMarker.Number);
	F64In.setFloat64(0, value, true);
	for (const byte of F64Out) FNV1A64_OP(byte);
}
function FromObject$6(value) {
	FNV1A64_OP(ByteMarker.Object);
	for (const key of InstanceKeys(value).sort()) {
		FromValue(key);
		FromValue(value[key]);
	}
}
function FromRegExp(value) {
	FNV1A64_OP(ByteMarker.RegExp);
	FromString(value.toString());
}
const encoder = new TextEncoder();
function FromString(value) {
	FNV1A64_OP(ByteMarker.String);
	for (const byte of encoder.encode(value)) FNV1A64_OP(byte);
}
function FromSymbol(value) {
	FNV1A64_OP(ByteMarker.Symbol);
	FromValue(value.toString());
}
function FromTypeArray(value) {
	FNV1A64_OP(ByteMarker.TypeArray);
	const buffer = new Uint8Array(value.buffer);
	for (let i = 0; i < buffer.length; i++) FNV1A64_OP(buffer[i]);
}
function FromUndefined(_value) {
	return FNV1A64_OP(ByteMarker.Undefined);
}
function FromValue(value) {
	return IsTypeArray(value) ? FromTypeArray(value) : IsDate(value) ? FromDate(value) : IsRegExp(value) ? FromRegExp(value) : IsBoolean$1(value) ? FromBoolean(value.valueOf()) : IsString$1(value) ? FromString(value.valueOf()) : IsNumber$1(value) ? FromNumber(value.valueOf()) : IsIEEE754(value) ? FromNumber(value) : IsArray$1(value) ? FromArray$3(value) : IsBoolean$2(value) ? FromBoolean(value) : IsBigInt$1(value) ? FromBigInt(value) : IsConstructor$1(value) ? FromConstructor(value) : IsNull$1(value) ? FromNull(value) : IsObject$1(value) ? FromObject$6(value) : IsString$2(value) ? FromString(value) : IsSymbol$1(value) ? FromSymbol(value) : IsUndefined$1(value) ? FromUndefined(value) : IsFunction$1(value) ? FromFunction(value) : Unreachable();
}
/** Generates a FNV1A-64 non cryptographic hash of the given value */
function HashCode(value) {
	Accumulator = BigInt("14695981039346656037");
	FromValue(value);
	return Accumulator;
}
/** Generates a FNV1A-64 non cryptographic hash of the given value */
function Hash(value) {
	return HashCode(value).toString(16).padStart(16, "0");
}
//#endregion
//#region node_modules/typebox/build/type/types/_codec.mjs
function IsCodec(value) {
	return IsSchema(value) && HasPropertyKey(value, "~codec") && IsObject$1(value["~codec"]) && HasPropertyKey(value["~codec"], "encode") && HasPropertyKey(value["~codec"], "decode");
}
//#endregion
//#region node_modules/typebox/build/type/types/bigint.mjs
const BigIntPattern = "-?(?:0|[1-9][0-9]*)n";
/** Creates a BigInt type. */
function BigInt$1(options) {
	return Create({ "~kind": "BigInt" }, { type: "bigint" }, options);
}
/** Returns true if the given value is a TBigInt. */
function IsBigInt(value) {
	return IsKind(value, "BigInt");
}
//#endregion
//#region node_modules/typebox/build/type/types/boolean.mjs
/** Creates a Boolean type. */
function Boolean$1(options) {
	return Create({ "~kind": "Boolean" }, { type: "boolean" }, options);
}
/** Returns true if the given value is a TBoolean. */
function IsBoolean(value) {
	return IsKind(value, "Boolean");
}
//#endregion
//#region node_modules/typebox/build/type/types/integer.mjs
const IntegerPattern = "-?(?:0|[1-9][0-9]*)";
/** Creates a Integer type. */
function Integer(options) {
	return Create({ "~kind": "Integer" }, { type: "integer" }, options);
}
/** Returns true if the given value is TInteger. */
function IsInteger(value) {
	return IsKind(value, "Integer");
}
//#endregion
//#region node_modules/typebox/build/type/types/iterator.mjs
/**
* Creates a Iterator type.
*
* @deprecated This type is being removed in the next version of TypeBox. A fallback will be provided under examples.
*/
function Iterator(iteratorItems, options) {
	return Create({ "~kind": "Iterator" }, {
		type: "iterator",
		iteratorItems
	}, options);
}
/** Returns true if the given value is TIterator. */
function IsIterator(value) {
	return IsKind(value, "Iterator");
}
/** Extracts options from a TIterator. */
function IteratorOptions(type) {
	return Discard(type, [
		"~kind",
		"type",
		"iteratorItems"
	]);
}
//#endregion
//#region node_modules/typebox/build/type/types/literal.mjs
var InvalidLiteralValue = class extends Error {
	constructor(value) {
		super(`Invalid Literal value`);
		Object.defineProperty(this, "cause", {
			value: { value },
			writable: false,
			configurable: false,
			enumerable: false
		});
	}
};
function LiteralTypeName(value) {
	return IsBigInt$1(value) ? "bigint" : IsBoolean$2(value) ? "boolean" : IsNumber$2(value) ? "number" : IsString$2(value) ? "string" : (() => {
		throw new InvalidLiteralValue(value);
	})();
}
/** Creates a Literal type. */
function Literal(value, options) {
	return Create({ "~kind": "Literal" }, {
		type: LiteralTypeName(value),
		const: value
	}, options);
}
/** Returns true if the given value is a TLiteralValue. */
function IsLiteralValue(value) {
	return IsBigInt$1(value) || IsBoolean$2(value) || IsNumber$2(value) || IsString$2(value);
}
/** Returns true if the given value is TLiteral<bigint>. */
function IsLiteralBigInt(value) {
	return IsLiteral(value) && IsBigInt$1(value.const);
}
/** Returns true if the given value is TLiteral<boolean>. */
function IsLiteralBoolean(value) {
	return IsLiteral(value) && IsBoolean$2(value.const);
}
/** Returns true if the given value is TLiteral<number>. */
function IsLiteralNumber(value) {
	return IsLiteral(value) && IsNumber$2(value.const);
}
/** Returns true if the given value is TLiteral<string>. */
function IsLiteralString(value) {
	return IsLiteral(value) && IsString$2(value.const);
}
/** Returns true if the given value is TLiteral. */
function IsLiteral(value) {
	return IsKind(value, "Literal");
}
//#endregion
//#region node_modules/typebox/build/type/types/null.mjs
/** Creates a Null type. */
function Null(options) {
	return Create({ "~kind": "Null" }, { type: "null" }, options);
}
/** Returns true if the given value is TNull. */
function IsNull(value) {
	return IsKind(value, "Null");
}
//#endregion
//#region node_modules/typebox/build/type/types/number.mjs
const NumberPattern = "-?(?:0|[1-9][0-9]*)(?:.[0-9]+)?";
/** Creates a Number type. */
function Number$1(options) {
	return Create({ "~kind": "Number" }, { type: "number" }, options);
}
/** Returns true if the given value is a TNumber. */
function IsNumber(value) {
	return IsKind(value, "Number");
}
//#endregion
//#region node_modules/typebox/build/type/types/symbol.mjs
/** Creates a Symbol type. */
function Symbol$1(options) {
	return Create({ "~kind": "Symbol" }, { type: "symbol" }, options);
}
/** Returns true if the given value is TSymbol. */
function IsSymbol(value) {
	return IsKind(value, "Symbol");
}
//#endregion
//#region node_modules/typebox/build/type/types/string.mjs
/** Creates a String type. */
function String$1(options) {
	return Create({ "~kind": "String" }, { type: "string" }, options);
}
/** Returns true if the given value is TString. */
function IsString(value) {
	return IsKind(value, "String");
}
//#endregion
//#region node_modules/typebox/build/type/engine/patterns/pattern.mjs
/** Parses a Pattern into a sequence of TemplateLiteral types. A result of [] indicates failure to parse. */
function ParsePatternIntoTypes(pattern) {
	const parsed = Pattern(pattern);
	return IsEqual(parsed.length, 2) ? parsed[0] : [];
}
//#endregion
//#region node_modules/typebox/build/type/engine/template_literal/is_finite.mjs
function FromLiteral$4(_value) {
	return true;
}
function FromTypesReduce(types) {
	return TakeLeft(types, (left, right) => FromType$17(left) ? FromTypesReduce(right) : false, () => true);
}
function FromTypes$4(types) {
	return IsEqual(types.length, 0) ? false : FromTypesReduce(types);
}
function FromType$17(type) {
	return IsUnion(type) ? FromTypes$4(type.anyOf) : IsLiteral(type) ? FromLiteral$4(type.const) : false;
}
/** Returns true if the given TemplateLiteral types yields a finite variant set */
function IsTemplateLiteralFinite(types) {
	return FromTypes$4(types);
}
//#endregion
//#region node_modules/typebox/build/type/engine/template_literal/create.mjs
function TemplateLiteralCreate(pattern) {
	return Create({ ["~kind"]: "TemplateLiteral" }, {
		type: "string",
		pattern
	}, {});
}
//#endregion
//#region node_modules/typebox/build/type/engine/template_literal/decode.mjs
function FromLiteralPush(variants, value, result = []) {
	return TakeLeft(variants, (left, right) => FromLiteralPush(right, value, [...result, `${left}${value}`]), () => result);
}
function FromLiteral$3(variants, value) {
	return IsEqual(variants.length, 0) ? [`${value}`] : FromLiteralPush(variants, value);
}
function FromUnion$7(variants, types, result = []) {
	return TakeLeft(types, (left, right) => FromUnion$7(variants, right, [...result, ...FromType$16(variants, left)]), () => result);
}
function FromType$16(variants, type) {
	return IsUnion(type) ? FromUnion$7(variants, type.anyOf) : IsLiteral(type) ? FromLiteral$3(variants, type.const) : Unreachable();
}
function DecodeFromSpan(variants, types) {
	return TakeLeft(types, (left, right) => DecodeFromSpan(FromType$16(variants, left), right), () => variants);
}
function VariantsToLiterals(variants) {
	return variants.map((variant) => Literal(variant));
}
function DecodeTypesAsUnion(types) {
	return Union(VariantsToLiterals(DecodeFromSpan([], types)));
}
function DecodeTypes(types) {
	return IsEqual(types.length, 0) ? Unreachable() : IsEqual(types.length, 1) && IsLiteral(types[0]) ? types[0] : DecodeTypesAsUnion(types);
}
/**
* (Internal) Decodes a TemplateLiteral pattern into a Type. This function is unsafe. Decoding a non-finite
* TemplateLiteral pattern may produce another TemplateLiteral pattern. During enumeration, this
* TemplateLiteral -> TemplateLiteral behavior can cause a StackOverflow. A better in-flight template-literal
* decoding algorithm is needed. (for review)
*/
function TemplateLiteralDecodeUnsafe(pattern) {
	const types = ParsePatternIntoTypes(pattern);
	return IsEqual(types.length, 0) ? String$1() : IsTemplateLiteralFinite(types) ? DecodeTypes(types) : TemplateLiteralCreate(pattern);
}
/** Decodes a TemplateLiteral pattern but returns TString if the pattern in non-finite. */
function TemplateLiteralDecode(pattern) {
	const decoded = TemplateLiteralDecodeUnsafe(pattern);
	return IsTemplateLiteral(decoded) ? String$1() : decoded;
}
//#endregion
//#region node_modules/typebox/build/type/engine/record/record_create.mjs
function CreateRecord(key, value) {
	const type = "object";
	const patternProperties = { [key]: value };
	return Create({ ["~kind"]: "Record" }, {
		type,
		patternProperties
	});
}
//#endregion
//#region node_modules/typebox/build/type/engine/record/from_key_any.mjs
function FromAnyKey(value) {
	return CreateRecord(StringKey, value);
}
//#endregion
//#region node_modules/typebox/build/type/engine/record/from_key_boolean.mjs
function FromBooleanKey(value) {
	return _Object_({
		true: value,
		false: value
	});
}
//#endregion
//#region node_modules/typebox/build/type/engine/enum/enum_to_union.mjs
function FromEnumValue(value) {
	return IsString$2(value) || IsNumber$2(value) ? Literal(value) : IsNull$1(value) ? Null() : Never();
}
function EnumValuesToVariants(values) {
	return values.map((value) => FromEnumValue(value));
}
function EnumValuesToUnion(values) {
	return Union(EnumValuesToVariants(values));
}
function EnumToUnion(type) {
	return EnumValuesToUnion(type.enum);
}
//#endregion
//#region node_modules/typebox/build/type/engine/record/from_key_enum.mjs
function FromEnumKey(values, value) {
	return FromKey(EnumValuesToUnion(values), value);
}
//#endregion
//#region node_modules/typebox/build/type/engine/record/from_key_integer.mjs
function FromIntegerKey(_key, value) {
	return CreateRecord(IntegerKey, value);
}
//#endregion
//#region node_modules/typebox/build/type/types/tuple.mjs
/** Creates a Tuple type. */
function Tuple(types, options = {}) {
	const [items, minItems, additionalItems] = [
		types,
		types.length,
		false
	];
	return Create({ ["~kind"]: "Tuple" }, {
		type: "array",
		additionalItems,
		items,
		minItems
	}, options);
}
/** Returns true if the given value is TTuple. */
function IsTuple(value) {
	return IsKind(value, "Tuple");
}
/** Extracts options from a TTuple. */
function TupleOptions(type) {
	return Discard(type, [
		"~kind",
		"type",
		"items",
		"minItems",
		"additionalItems"
	]);
}
//#endregion
//#region node_modules/typebox/build/type/engine/tuple/to_object.mjs
function TupleElementsToProperties(types) {
	return types.reduceRight((result, right, index) => {
		return {
			[index]: right,
			...result
		};
	}, {});
}
function TupleToObject(type) {
	return _Object_(TupleElementsToProperties(type.items));
}
//#endregion
//#region node_modules/typebox/build/type/engine/evaluate/composite.mjs
function IsReadonlyProperty(left, right) {
	return IsReadonly(left) ? IsReadonly(right) ? true : false : false;
}
function IsOptionalProperty(left, right) {
	return IsOptional(left) ? IsOptional(right) ? true : false : false;
}
function CompositeProperty(left, right) {
	const isReadonly = IsReadonlyProperty(left, right);
	const isOptional = IsOptionalProperty(left, right);
	const property = ReadonlyRemove(OptionalRemove(EvaluateIntersect([left, right])));
	return isReadonly && isOptional ? ReadonlyAdd(OptionalAdd(property)) : isReadonly && !isOptional ? ReadonlyAdd(property) : !isReadonly && isOptional ? OptionalAdd(property) : property;
}
function CompositePropertyKey(left, right, key) {
	return key in left ? key in right ? CompositeProperty(left[key], right[key]) : left[key] : key in right ? right[key] : Never();
}
function CompositeProperties(left, right) {
	return [...new Set([...Keys(right), ...Keys(left)])].reduce((result, key) => {
		return {
			...result,
			[key]: CompositePropertyKey(left, right, key)
		};
	}, {});
}
function GetProperties(type) {
	return IsObject(type) ? type.properties : IsTuple(type) ? TupleElementsToProperties(type.items) : Unreachable();
}
function Composite(left, right) {
	return _Object_(CompositeProperties(GetProperties(left), GetProperties(right)));
}
//#endregion
//#region node_modules/typebox/build/type/engine/evaluate/narrow.mjs
function Narrow(left, right) {
	const result = Compare(left, right);
	return IsEqual(result, "left-inside") ? left : IsEqual(result, "right-inside") ? right : IsEqual(result, "equal") ? right : Never();
}
//#endregion
//#region node_modules/typebox/build/type/engine/evaluate/distribute.mjs
function IsObjectLike(type) {
	return IsObject(type) || IsTuple(type);
}
function IsUnionOperand(left, right) {
	const isUnionLeft = IsUnion(left);
	const isUnionRight = IsUnion(right);
	return isUnionLeft || isUnionRight;
}
function DistributeOperation(left, right) {
	const evaluatedLeft = EvaluateType(left);
	const evaluatedRight = EvaluateType(right);
	const isUnionOperand = IsUnionOperand(evaluatedLeft, evaluatedRight);
	const isObjectLeft = IsObjectLike(evaluatedLeft);
	const IsObjectRight = IsObjectLike(evaluatedRight);
	return isUnionOperand ? EvaluateIntersect([evaluatedLeft, evaluatedRight]) : isObjectLeft && IsObjectRight ? Composite(evaluatedLeft, evaluatedRight) : isObjectLeft && !IsObjectRight ? evaluatedLeft : !isObjectLeft && IsObjectRight ? evaluatedRight : Narrow(evaluatedLeft, evaluatedRight);
}
function DistributeType(type, types, result = []) {
	return TakeLeft(types, (left, right) => DistributeType(type, right, [...result, DistributeOperation(type, left)]), () => IsEqual(result.length, 0) ? [type] : result);
}
function DistributeUnion(types, distribution, result = []) {
	return TakeLeft(types, (left, right) => DistributeUnion(right, distribution, [...result, ...Distribute$1([left], distribution)]), () => result);
}
function Distribute$1(types, result = []) {
	return TakeLeft(types, (left, right) => IsUnion(left) ? Distribute$1(right, DistributeUnion(left.anyOf, result)) : Distribute$1(right, DistributeType(left, result)), () => result);
}
//#endregion
//#region node_modules/typebox/build/type/engine/evaluate/evaluate.mjs
function EvaluateIntersect(types) {
	return Broaden(Distribute$1(types));
}
function EvaluateUnion(types) {
	return Broaden(types);
}
function EvaluateType(type) {
	return IsIntersect(type) ? EvaluateIntersect(type.allOf) : IsUnion(type) ? EvaluateUnion(type.anyOf) : type;
}
function EvaluateUnionFast(types) {
	return IsEqual(types.length, 1) ? types[0] : IsEqual(types.length, 0) ? Never() : Union(types);
}
//#endregion
//#region node_modules/typebox/build/type/engine/record/from_key_intersect.mjs
function FromIntersectKey(types, value) {
	return FromKey(EvaluateIntersect(types), value);
}
//#endregion
//#region node_modules/typebox/build/type/engine/record/from_key_literal.mjs
function FromLiteralKey(key, value) {
	return IsString$2(key) || IsNumber$2(key) ? _Object_({ [key]: value }) : IsEqual(key, false) ? _Object_({ false: value }) : IsEqual(key, true) ? _Object_({ true: value }) : _Object_({});
}
//#endregion
//#region node_modules/typebox/build/type/engine/record/from_key_number.mjs
function FromNumberKey(_key, value) {
	return CreateRecord(NumberKey, value);
}
//#endregion
//#region node_modules/typebox/build/type/engine/record/from_key_string.mjs
function FromStringKey(key, value) {
	return HasPropertyKey(key, "pattern") && (IsString$2(key.pattern) || key.pattern instanceof RegExp) ? CreateRecord(key.pattern.toString(), value) : CreateRecord(StringKey, value);
}
//#endregion
//#region node_modules/typebox/build/type/engine/record/from_key_template_literal.mjs
function FromTemplateKey(pattern, value) {
	return IsTemplateLiteralFinite(ParsePatternIntoTypes(pattern)) ? FromKey(TemplateLiteralDecode(pattern), value) : CreateRecord(pattern, value);
}
//#endregion
//#region node_modules/typebox/build/type/engine/evaluate/flatten.mjs
function FlattenType(type) {
	return IsUnion(type) ? Flatten(type.anyOf) : [type];
}
function Flatten(types) {
	return types.reduce((result, type) => {
		return [...result, ...FlattenType(type)];
	}, []);
}
//#endregion
//#region node_modules/typebox/build/type/engine/record/from_key_union.mjs
function StringOrNumberCheck(types) {
	return types.some((type) => IsString(type) || IsNumber(type) || IsInteger(type));
}
function TryBuildRecord(types, value) {
	return IsEqual(StringOrNumberCheck(types), true) ? CreateRecord(StringKey, value) : void 0;
}
function CreateProperties(types, value) {
	return types.reduce((result, left) => {
		return IsLiteral(left) && (IsString$2(left.const) || IsNumber$2(left.const)) ? {
			...result,
			[left.const]: value
		} : result;
	}, {});
}
function CreateObject(types, value) {
	return _Object_(CreateProperties(types, value));
}
function FromUnionKey(types, value) {
	const flattened = Flatten(types);
	const record = TryBuildRecord(flattened, value);
	return IsSchema(record) ? record : CreateObject(flattened, value);
}
//#endregion
//#region node_modules/typebox/build/type/engine/record/from_key.mjs
function FromKey(key, value) {
	return IsAny(key) ? FromAnyKey(value) : IsBoolean(key) ? FromBooleanKey(value) : IsEnum(key) ? FromEnumKey(key.enum, value) : IsInteger(key) ? FromIntegerKey(key, value) : IsIntersect(key) ? FromIntersectKey(key.allOf, value) : IsLiteral(key) ? FromLiteralKey(key.const, value) : IsNumber(key) ? FromNumberKey(key, value) : IsUnion(key) ? FromUnionKey(key.anyOf, value) : IsString(key) ? FromStringKey(key, value) : IsTemplateLiteral(key) ? FromTemplateKey(key.pattern, value) : _Object_({});
}
//#endregion
//#region node_modules/typebox/build/type/engine/record/instantiate.mjs
function RecordAction(key, value, options) {
	return CanInstantiate([key]) ? Update(FromKey(key, value), {}, options) : RecordDeferred(key, value, options);
}
function RecordInstantiate(context, state, key, value, options) {
	return RecordAction(InstantiateType(context, state, key), InstantiateType(context, state, value), options);
}
//#endregion
//#region node_modules/typebox/build/type/types/record.mjs
const IntegerKey = `^${IntegerPattern}$`;
const NumberKey = `^${NumberPattern}$`;
const StringKey = `^.*$`;
/** Represents a deferred Record action. */
function RecordDeferred(key, value, options = {}) {
	return Deferred("Record", [key, value], options);
}
/** Creates a Record type. */
function Record(key, value, options = {}) {
	return RecordAction(key, value, options);
}
/** Creates a Record type from regular expression pattern. */
function RecordFromPattern(key, value) {
	return CreateRecord(key, value);
}
/** Returns the raw string pattern used for the Record key  */
function RecordPattern(type) {
	return Keys(type.patternProperties)[0];
}
/** Returns the Record key as a TypeBox type  */
function RecordKey(type) {
	const pattern = RecordPattern(type);
	return IsEqual(pattern, StringKey) ? String$1() : IsEqual(pattern, IntegerKey) ? Integer() : IsEqual(pattern, NumberKey) ? Number$1() : TemplateLiteralDecodeUnsafe(pattern);
}
function RecordValue(type) {
	return type.patternProperties[RecordPattern(type)];
}
function IsRecord(value) {
	return IsKind(value, "Record");
}
//#endregion
//#region node_modules/typebox/build/type/types/rest.mjs
/** Creates a Rest instruction type. */
function Rest(type) {
	return Create({ "~kind": "Rest" }, {
		type: "rest",
		items: type
	}, {});
}
/** Returns true if the given value is TRest. */
function IsRest(value) {
	return IsKind(value, "Rest");
}
//#endregion
//#region node_modules/typebox/build/type/types/this.mjs
/** Returns true if the given value is TThis. */
function IsThis(value) {
	return IsKind(value, "This");
}
//#endregion
//#region node_modules/typebox/build/type/types/undefined.mjs
/** Creates a Undefined type. */
function Undefined(options) {
	return Create({ "~kind": "Undefined" }, { type: "undefined" }, options);
}
/** Returns true if the given value is TUndefined. */
function IsUndefined(value) {
	return IsKind(value, "Undefined");
}
//#endregion
//#region node_modules/typebox/build/type/types/void.mjs
/** Returns true if the given value is TVoid. */
function IsVoid(value) {
	return IsKind(value, "Void");
}
//#endregion
//#region node_modules/typebox/build/type/script/mapping.mjs
function PatternBigIntMapping(input) {
	return BigInt$1();
}
function PatternStringMapping(input) {
	return String$1();
}
function PatternNumberMapping(input) {
	return Number$1();
}
function PatternIntegerMapping(input) {
	return Integer();
}
function PatternNeverMapping(input) {
	return Never();
}
function PatternTextMapping(input) {
	return Literal(input);
}
function PatternBaseMapping(input) {
	return input;
}
function PatternGroupMapping(input) {
	return Union(input[1]);
}
function PatternUnionMapping(input) {
	return input.length === 3 ? [...input[0], ...input[2]] : input.length === 1 ? [...input[0]] : [];
}
function PatternTermMapping(input) {
	return [input[0], ...input[1]];
}
function PatternBodyMapping(input) {
	return input;
}
function PatternMapping(input) {
	return input[1];
}
//#endregion
//#region node_modules/typebox/build/type/script/token/internal/match.mjs
/** Checks the value is a Tuple-2 [string, string] result */
function IsMatch(value) {
	return IsEqual(value.length, 2);
}
/** Matches on a result and dispatches either left or right arm */
function Match$1(input, ok, fail) {
	return IsMatch(input) ? ok(input[0], input[1]) : fail();
}
//#endregion
//#region node_modules/typebox/build/type/script/token/internal/take.mjs
function TakeVariant(variant, input) {
	return IsEqual(input.indexOf(variant), 0) ? [variant, input.slice(variant.length)] : [];
}
/** Takes one of the given variants or fail */
function Take(variants, input) {
	for (let i = 0; i < variants.length; i++) {
		const result = TakeVariant(variants[i], input);
		if (IsMatch(result)) return result;
	}
	return [];
}
//#endregion
//#region node_modules/typebox/build/type/script/token/internal/char.mjs
function Range(start, end) {
	return Array.from({ length: end - start + 1 }, (_, i) => String.fromCharCode(start + i));
}
const Alpha = [...Range(97, 122), ...Range(65, 90)];
const Digit = ["0", ...Range(49, 57)];
//#endregion
//#region node_modules/typebox/build/type/script/token/internal/trim.mjs
const LineComment = "//";
const OpenComment = "/*";
const CloseComment = "*/";
function DiscardMultilineComment(input) {
	const index = input.indexOf(CloseComment);
	return IsEqual(index, -1) ? "" : input.slice(index + 2);
}
function DiscardLineComment(input) {
	const index = input.indexOf("\n");
	return IsEqual(index, -1) ? "" : input.slice(index);
}
function TrimStartUntilNewline(input) {
	return input.replace(/^[ \t\r\f\v]+/, "");
}
function TrimWhitespace(input) {
	const trimmed = TrimStartUntilNewline(input);
	return trimmed.startsWith(OpenComment) ? TrimWhitespace(DiscardMultilineComment(trimmed.slice(2))) : trimmed.startsWith(LineComment) ? TrimWhitespace(DiscardLineComment(trimmed.slice(2))) : trimmed;
}
function Trim(input) {
	const trimmed = input.trimStart();
	return trimmed.startsWith(OpenComment) ? Trim(DiscardMultilineComment(trimmed.slice(2))) : trimmed.startsWith(LineComment) ? Trim(DiscardLineComment(trimmed.slice(2))) : trimmed;
}
[...Digit];
//#endregion
//#region node_modules/typebox/build/type/script/token/const.mjs
function TakeConst(const_, input) {
	return Take([const_], input);
}
/** Matches if next is the given Const value */
function Const(const_, input) {
	return IsEqual(const_, "") ? ["", input] : const_.startsWith("\n") ? TakeConst(const_, TrimWhitespace(input)) : const_.startsWith(" ") ? TakeConst(const_, input) : TakeConst(const_, Trim(input));
}
[...[
	...Alpha,
	"_",
	"$"
], ...Digit];
[...Digit];
//#endregion
//#region node_modules/typebox/build/type/script/token/until.mjs
function TakeOne(input) {
	return IsEqual(input, "") ? [] : [input.slice(0, 1), input.slice(1)];
}
function IsInputMatchSentinal(end, input) {
	return TakeLeft(end, (left, right) => input.startsWith(left) ? true : IsInputMatchSentinal(right, input), () => false);
}
/** Match Input until but not including End. No match if End not found. */
function Until(end, input, result = "") {
	return Match$1(TakeOne(input), (One, Rest) => IsInputMatchSentinal(end, input) ? [result, input] : Until(end, Rest, `${result}${One}`), () => []);
}
//#endregion
//#region node_modules/typebox/build/type/script/token/until_1.mjs
/** Match Input until but not including End. No match if End not found or match is zero-length. */
function Until_1(end, input) {
	return Match$1(Until(end, input), (Until, UntilRest) => IsEqual(Until, "") ? [] : [Until, UntilRest], () => []);
}
//#endregion
//#region node_modules/typebox/build/type/script/parser.mjs
const If = (result, left, right = () => []) => result.length === 2 ? left(result) : right();
const PatternBigInt = (input) => If(Const("-?(?:0|[1-9][0-9]*)n", input), ([_0, input]) => [PatternBigIntMapping(_0), input]);
const PatternString = (input) => If(Const(".*", input), ([_0, input]) => [PatternStringMapping(_0), input]);
const PatternNumber = (input) => If(Const("-?(?:0|[1-9][0-9]*)(?:.[0-9]+)?", input), ([_0, input]) => [PatternNumberMapping(_0), input]);
const PatternInteger = (input) => If(Const("-?(?:0|[1-9][0-9]*)", input), ([_0, input]) => [PatternIntegerMapping(_0), input]);
const PatternNever = (input) => If(Const("(?!)", input), ([_0, input]) => [PatternNeverMapping(_0), input]);
const PatternText = (input) => If(Until_1([
	"-?(?:0|[1-9][0-9]*)n",
	".*",
	"-?(?:0|[1-9][0-9]*)(?:.[0-9]+)?",
	"-?(?:0|[1-9][0-9]*)",
	"(?!)",
	"(",
	")",
	"$",
	"|"
], input), ([_0, input]) => [PatternTextMapping(_0), input]);
const PatternBase = (input) => If(If(PatternBigInt(input), ([_0, input]) => [_0, input], () => If(PatternString(input), ([_0, input]) => [_0, input], () => If(PatternNumber(input), ([_0, input]) => [_0, input], () => If(PatternInteger(input), ([_0, input]) => [_0, input], () => If(PatternNever(input), ([_0, input]) => [_0, input], () => If(PatternGroup(input), ([_0, input]) => [_0, input], () => If(PatternText(input), ([_0, input]) => [_0, input], () => []))))))), ([_0, input]) => [PatternBaseMapping(_0), input]);
const PatternGroup = (input) => If(If(Const("(", input), ([_0, input]) => If(PatternBody(input), ([_1, input]) => If(Const(")", input), ([_2, input]) => [[
	_0,
	_1,
	_2
], input]))), ([_0, input]) => [PatternGroupMapping(_0), input]);
const PatternUnion = (input) => If(If(If(PatternTerm(input), ([_0, input]) => If(Const("|", input), ([_1, input]) => If(PatternUnion(input), ([_2, input]) => [[
	_0,
	_1,
	_2
], input]))), ([_0, input]) => [_0, input], () => If(If(PatternTerm(input), ([_0, input]) => [[_0], input]), ([_0, input]) => [_0, input], () => If([[], input], ([_0, input]) => [_0, input], () => []))), ([_0, input]) => [PatternUnionMapping(_0), input]);
const PatternTerm = (input) => If(If(PatternBase(input), ([_0, input]) => If(PatternBody(input), ([_1, input]) => [[_0, _1], input])), ([_0, input]) => [PatternTermMapping(_0), input]);
const PatternBody = (input) => If(If(PatternUnion(input), ([_0, input]) => [_0, input], () => If(PatternTerm(input), ([_0, input]) => [_0, input], () => [])), ([_0, input]) => [PatternBodyMapping(_0), input]);
const Pattern = (input) => If(If(Const("^", input), ([_0, input]) => If(PatternBody(input), ([_1, input]) => If(Const("$", input), ([_2, input]) => [[
	_0,
	_1,
	_2
], input]))), ([_0, input]) => [PatternMapping(_0), input]);
//#endregion
//#region node_modules/typebox/build/type/engine/template_literal/encode.mjs
function JoinString(input) {
	return input.join("|");
}
function UnwrapTemplateLiteralPattern(pattern) {
	return pattern.slice(1, pattern.length - 1);
}
function EncodeLiteral(value, right, pattern) {
	return EncodeTypes(right, `${pattern}${value}`);
}
function EncodeBigInt(right, pattern) {
	return EncodeTypes(right, `${pattern}${BigIntPattern}`);
}
function EncodeInteger(right, pattern) {
	return EncodeTypes(right, `${pattern}${IntegerPattern}`);
}
function EncodeNumber(right, pattern) {
	return EncodeTypes(right, `${pattern}${NumberPattern}`);
}
function EncodeBoolean(right, pattern) {
	return EncodeType(Union([Literal("false"), Literal("true")]), right, pattern);
}
function EncodeString(right, pattern) {
	return EncodeTypes(right, `${pattern}.*`);
}
function EncodeTemplateLiteral(templatePattern, right, pattern) {
	return EncodeTypes(right, `${pattern}${UnwrapTemplateLiteralPattern(templatePattern)}`);
}
function EncodeTemplateLiteralDeferred(types, right, pattern) {
	return EncodeType(TemplateLiteralAction(types, {}), right, pattern);
}
function EncodeEnum(types, right, pattern) {
	return EncodeUnion(EnumValuesToVariants(types), right, pattern);
}
function EncodeUnion(types, right, pattern, result = []) {
	return TakeLeft(types, (head, tail) => EncodeUnion(tail, right, pattern, [...result, EncodeType(head, [], "")]), () => EncodeTypes(right, `${pattern}(${JoinString(result)})`));
}
function EncodeType(type, right, pattern) {
	return IsEnum(type) ? EncodeEnum(type.enum, right, pattern) : IsInteger(type) ? EncodeInteger(right, pattern) : IsLiteral(type) ? EncodeLiteral(type.const, right, pattern) : IsBigInt(type) ? EncodeBigInt(right, pattern) : IsBoolean(type) ? EncodeBoolean(right, pattern) : IsNumber(type) ? EncodeNumber(right, pattern) : IsString(type) ? EncodeString(right, pattern) : IsTemplateLiteral(type) ? EncodeTemplateLiteral(type.pattern, right, pattern) : IsTemplateLiteralDeferred(type) ? EncodeTemplateLiteralDeferred(type.parameters[0], right, pattern) : IsUnion(type) ? EncodeUnion(type.anyOf, right, pattern) : NeverPattern;
}
function EncodeTypes(types, pattern) {
	return TakeLeft(types, (left, right) => EncodeType(left, right, pattern), () => pattern);
}
function EncodePattern(types) {
	return `^${EncodeTypes(types, "")}$`;
}
/** Encodes a TemplateLiteral type sequence into a TemplateLiteral */
function TemplateLiteralEncode(types) {
	return TemplateLiteralCreate(EncodePattern(types));
}
//#endregion
//#region node_modules/typebox/build/type/engine/template_literal/instantiate.mjs
function TemplateLiteralAction(types, options) {
	return CanInstantiate(types) ? Update(TemplateLiteralEncode(types), {}, options) : TemplateLiteralDeferred(types, options);
}
function TemplateLiteralInstantiate(context, state, types, options) {
	return TemplateLiteralAction(InstantiateTypes(context, state, types), options);
}
//#endregion
//#region node_modules/typebox/build/type/types/template_literal.mjs
/** Creates a deferred TemplateLiteral action. */
function TemplateLiteralDeferred(types, options = {}) {
	return Deferred("TemplateLiteral", [types], options);
}
/** Returns true if this value is a deferred Interface action. */
function IsTemplateLiteralDeferred(value) {
	return IsSchema(value) && HasPropertyKey(value, "action") && IsEqual(value.action, "TemplateLiteral");
}
/** Returns true if the given value is TTemplateLiteral. */
function IsTemplateLiteral(value) {
	return IsKind(value, "TemplateLiteral");
}
//#endregion
//#region node_modules/typebox/build/type/extends/result.mjs
function ExtendsUnion$1(inferred) {
	return Create({ ["~kind"]: "ExtendsUnion" }, { inferred });
}
function IsExtendsUnion(value) {
	return IsObject$1(value) && HasPropertyKey(value, "~kind") && HasPropertyKey(value, "inferred") && IsEqual(value["~kind"], "ExtendsUnion") && IsObject$1(value.inferred);
}
function ExtendsTrue(inferred) {
	return Create({ ["~kind"]: "ExtendsTrue" }, { inferred });
}
function IsExtendsTrue(value) {
	return IsObject$1(value) && HasPropertyKey(value, "~kind") && HasPropertyKey(value, "inferred") && IsEqual(value["~kind"], "ExtendsTrue") && IsObject$1(value.inferred);
}
function ExtendsFalse() {
	return Create({ ["~kind"]: "ExtendsFalse" }, {});
}
function IsExtendsFalse(value) {
	return IsObject$1(value) && HasPropertyKey(value, "~kind") && IsEqual(value["~kind"], "ExtendsFalse");
}
function IsExtendsTrueLike(value) {
	return IsExtendsUnion(value) || IsExtendsTrue(value);
}
function Match(result, true_, false_) {
	return IsExtendsTrueLike(result) ? true_(result.inferred) : false_();
}
//#endregion
//#region node_modules/typebox/build/type/extends/extends_right.mjs
function ExtendsRightInfer(inferred, name, left, right) {
	return Match(ExtendsLeft(inferred, left, right), (checkInferred) => ExtendsTrue(Assign(Assign(inferred, checkInferred), { [name]: left })), () => ExtendsFalse());
}
function ExtendsRightAny(inferred, _left) {
	return ExtendsTrue(inferred);
}
function ExtendsRightEnum(inferred, left, right) {
	return ExtendsLeft(inferred, left, EnumValuesToUnion(right));
}
function ExtendsRightIntersect(inferred, left, right) {
	return TakeLeft(right, (head, tail) => Match(ExtendsLeft(inferred, left, head), (inferred) => ExtendsRightIntersect(inferred, left, tail), () => ExtendsFalse()), () => ExtendsTrue(inferred));
}
function ExtendsRightTemplateLiteral(inferred, left, right) {
	return ExtendsLeft(inferred, left, TemplateLiteralDecode(right));
}
function ExtendsRightUnion(inferred, left, right) {
	return TakeLeft(right, (head, tail) => Match(ExtendsLeft(inferred, left, head), (inferred) => ExtendsTrue(inferred), () => ExtendsRightUnion(inferred, left, tail)), () => ExtendsFalse());
}
function ExtendsRight(inferred, left, right) {
	return IsAny(right) ? ExtendsRightAny(inferred, left) : IsEnum(right) ? ExtendsRightEnum(inferred, left, right.enum) : IsInfer(right) ? ExtendsRightInfer(inferred, right.name, left, right.extends) : IsIntersect(right) ? ExtendsRightIntersect(inferred, left, right.allOf) : IsTemplateLiteral(right) ? ExtendsRightTemplateLiteral(inferred, left, right.pattern) : IsUnion(right) ? ExtendsRightUnion(inferred, left, right.anyOf) : IsUnknown(right) ? ExtendsTrue(inferred) : ExtendsFalse();
}
//#endregion
//#region node_modules/typebox/build/type/extends/any.mjs
function ExtendsAny(inferred, left, right) {
	return IsInfer(right) ? ExtendsRight(inferred, left, right) : IsAny(right) ? ExtendsTrue(inferred) : IsUnknown(right) ? ExtendsTrue(inferred) : ExtendsUnion$1(inferred);
}
//#endregion
//#region node_modules/typebox/build/type/extends/array.mjs
function ExtendsImmutable(left, right) {
	const isImmutableLeft = IsImmutable(left);
	const isImmutableRight = IsImmutable(right);
	return isImmutableLeft && isImmutableRight ? true : !isImmutableLeft && isImmutableRight ? true : isImmutableLeft && !isImmutableRight ? false : true;
}
function ExtendsArray(inferred, arrayLeft, left, right) {
	return IsArray(right) ? ExtendsImmutable(arrayLeft, right) ? ExtendsLeft(inferred, left, right.items) : ExtendsFalse() : ExtendsRight(inferred, arrayLeft, right);
}
//#endregion
//#region node_modules/typebox/build/type/extends/async_iterator.mjs
function ExtendsAsyncIterator(inferred, left, right) {
	return IsAsyncIterator(right) ? ExtendsLeft(inferred, left, right.iteratorItems) : ExtendsRight(inferred, AsyncIterator(left), right);
}
//#endregion
//#region node_modules/typebox/build/type/extends/bigint.mjs
function ExtendsBigInt(inferred, left, right) {
	return IsBigInt(right) ? ExtendsTrue(inferred) : ExtendsRight(inferred, left, right);
}
//#endregion
//#region node_modules/typebox/build/type/extends/boolean.mjs
function ExtendsBoolean(inferred, left, right) {
	return IsBoolean(right) ? ExtendsTrue(inferred) : ExtendsRight(inferred, left, right);
}
//#endregion
//#region node_modules/typebox/build/type/extends/parameters.mjs
function ParameterCompare(inferred, left, leftRest, right, rightRest) {
	const checkLeft = IsInfer(right) ? left : right;
	const checkRight = IsInfer(right) ? right : left;
	const isLeftOptional = IsOptional(left);
	const isRightOptional = IsOptional(right);
	return !isLeftOptional && isRightOptional ? ExtendsFalse() : Match(ExtendsLeft(inferred, checkLeft, checkRight), (inferred) => ExtendsParameters(inferred, leftRest, rightRest), () => ExtendsFalse());
}
function ParameterRight(inferred, left, leftRest, rightRest) {
	return TakeLeft(rightRest, (head, tail) => ParameterCompare(inferred, left, leftRest, head, tail), () => IsOptional(left) ? ExtendsTrue(inferred) : ExtendsFalse());
}
function ParametersLeft(inferred, left, rightRest) {
	return TakeLeft(left, (head, tail) => ParameterRight(inferred, head, tail, rightRest), () => ExtendsTrue(inferred));
}
function ExtendsParameters(inferred, left, right) {
	return ParametersLeft(inferred, left, right);
}
//#endregion
//#region node_modules/typebox/build/type/extends/return_type.mjs
function ExtendsReturnType(inferred, left, right) {
	return IsVoid(right) ? ExtendsTrue(inferred) : ExtendsLeft(inferred, left, right);
}
//#endregion
//#region node_modules/typebox/build/type/extends/constructor.mjs
function ExtendsConstructor(inferred, parameters, returnType, right) {
	return IsAny(right) ? ExtendsTrue(inferred) : IsUnknown(right) ? ExtendsTrue(inferred) : IsConstructor(right) ? Match(ExtendsParameters(inferred, parameters, right["parameters"]), (inferred) => ExtendsReturnType(inferred, returnType, right["instanceType"]), () => ExtendsFalse()) : ExtendsFalse();
}
//#endregion
//#region node_modules/typebox/build/type/extends/enum.mjs
function ExtendsEnum(inferred, left, right) {
	return ExtendsLeft(inferred, EnumToUnion(left), right);
}
//#endregion
//#region node_modules/typebox/build/type/extends/function.mjs
function ExtendsFunction(inferred, parameters, returnType, right) {
	return IsAny(right) ? ExtendsTrue(inferred) : IsUnknown(right) ? ExtendsTrue(inferred) : IsFunction(right) ? Match(ExtendsParameters(inferred, parameters, right["parameters"]), (inferred) => ExtendsReturnType(inferred, returnType, right["returnType"]), () => ExtendsFalse()) : ExtendsFalse();
}
//#endregion
//#region node_modules/typebox/build/type/extends/integer.mjs
function ExtendsInteger(inferred, left, right) {
	return IsInteger(right) ? ExtendsTrue(inferred) : IsNumber(right) ? ExtendsTrue(inferred) : ExtendsRight(inferred, left, right);
}
//#endregion
//#region node_modules/typebox/build/type/extends/intersect.mjs
function ExtendsIntersect(inferred, left, right) {
	return ExtendsLeft(inferred, EvaluateIntersect(left), right);
}
//#endregion
//#region node_modules/typebox/build/type/extends/iterator.mjs
function ExtendsIterator(inferred, left, right) {
	return IsIterator(right) ? ExtendsLeft(inferred, left, right.iteratorItems) : ExtendsRight(inferred, Iterator(left), right);
}
//#endregion
//#region node_modules/typebox/build/type/extends/literal.mjs
function ExtendsLiteralValue(inferred, left, right) {
	return left === right ? ExtendsTrue(inferred) : ExtendsFalse();
}
function ExtendsLiteralBigInt(inferred, left, right) {
	return IsLiteral(right) ? ExtendsLiteralValue(inferred, left, right.const) : IsBigInt(right) ? ExtendsTrue(inferred) : ExtendsRight(inferred, Literal(left), right);
}
function ExtendsLiteralBoolean(inferred, left, right) {
	return IsLiteral(right) ? ExtendsLiteralValue(inferred, left, right.const) : IsBoolean(right) ? ExtendsTrue(inferred) : ExtendsRight(inferred, Literal(left), right);
}
function ExtendsLiteralNumber(inferred, left, right) {
	return IsLiteral(right) ? ExtendsLiteralValue(inferred, left, right.const) : IsNumber(right) ? ExtendsTrue(inferred) : ExtendsRight(inferred, Literal(left), right);
}
function ExtendsLiteralString(inferred, left, right) {
	return IsLiteral(right) ? ExtendsLiteralValue(inferred, left, right.const) : IsString(right) ? ExtendsTrue(inferred) : ExtendsRight(inferred, Literal(left), right);
}
function ExtendsLiteral(inferred, left, right) {
	return IsBigInt$1(left.const) ? ExtendsLiteralBigInt(inferred, left.const, right) : IsBoolean$2(left.const) ? ExtendsLiteralBoolean(inferred, left.const, right) : IsNumber$2(left.const) ? ExtendsLiteralNumber(inferred, left.const, right) : IsString$2(left.const) ? ExtendsLiteralString(inferred, left.const, right) : Unreachable();
}
//#endregion
//#region node_modules/typebox/build/type/extends/never.mjs
function ExtendsNever(inferred, left, right) {
	return IsInfer(right) ? ExtendsRight(inferred, left, right) : ExtendsTrue(inferred);
}
//#endregion
//#region node_modules/typebox/build/type/extends/null.mjs
function ExtendsNull(inferred, left, right) {
	return IsNull(right) ? ExtendsTrue(inferred) : ExtendsRight(inferred, left, right);
}
//#endregion
//#region node_modules/typebox/build/type/extends/number.mjs
function ExtendsNumber(inferred, left, right) {
	return IsNumber(right) ? ExtendsTrue(inferred) : ExtendsRight(inferred, left, right);
}
//#endregion
//#region node_modules/typebox/build/type/extends/object.mjs
function ExtendsPropertyOptional(inferred, left, right) {
	return IsOptional(left) ? IsOptional(right) ? ExtendsTrue(inferred) : ExtendsFalse() : ExtendsTrue(inferred);
}
function ExtendsProperty(inferred, left, right) {
	return IsInfer(right) && IsNever(right.extends) ? ExtendsFalse() : Match(ExtendsLeft(inferred, left, right), (inferred) => ExtendsPropertyOptional(inferred, left, right), () => ExtendsFalse());
}
function ExtractInferredProperties(keys, properties) {
	return keys.reduce((result, key) => {
		return key in properties ? IsExtendsTrueLike(properties[key]) ? {
			...result,
			...properties[key].inferred
		} : Unreachable() : Unreachable();
	}, {});
}
function ExtendsPropertiesComparer(inferred, left, right) {
	const properties = {};
	for (const rightKey of Keys(right)) properties[rightKey] = rightKey in left ? ExtendsProperty({}, left[rightKey], right[rightKey]) : IsOptional(right[rightKey]) ? IsInfer(right[rightKey]) ? ExtendsTrue(Assign(inferred, { [right[rightKey].name]: right[rightKey].extends })) : ExtendsTrue(inferred) : ExtendsFalse();
	const checked = Values(properties).every((result) => IsExtendsTrueLike(result));
	const extracted = checked ? ExtractInferredProperties(Keys(properties), properties) : {};
	return checked ? ExtendsTrue(extracted) : ExtendsFalse();
}
function ExtendsProperties(inferred, left, right) {
	const compared = ExtendsPropertiesComparer(inferred, left, right);
	return IsExtendsTrueLike(compared) ? ExtendsTrue(Assign(inferred, compared.inferred)) : ExtendsFalse();
}
function ExtendsObjectToObject(inferred, left, right) {
	return ExtendsProperties(inferred, left, right);
}
function ExtendsObject(inferred, left, right) {
	return IsObject(right) ? ExtendsObjectToObject(inferred, left, right.properties) : ExtendsRight(inferred, _Object_(left), right);
}
//#endregion
//#region node_modules/typebox/build/type/extends/promise.mjs
function ExtendsPromise(inferred, left, right) {
	return IsPromise(right) ? ExtendsLeft(inferred, left, right.item) : ExtendsRight(inferred, _Promise_(left), right);
}
//#endregion
//#region node_modules/typebox/build/type/extends/string.mjs
function ExtendsString(inferred, left, right) {
	return IsString(right) ? ExtendsTrue(inferred) : ExtendsRight(inferred, left, right);
}
//#endregion
//#region node_modules/typebox/build/type/extends/symbol.mjs
function ExtendsSymbol(inferred, left, right) {
	return IsSymbol(right) ? ExtendsTrue(inferred) : ExtendsRight(inferred, left, right);
}
//#endregion
//#region node_modules/typebox/build/type/extends/template_literal.mjs
function ExtendsTemplateLiteral(inferred, left, right) {
	return ExtendsLeft(inferred, TemplateLiteralDecode(left), right);
}
//#endregion
//#region node_modules/typebox/build/type/extends/inference.mjs
function Inferrable(name, type) {
	return Create({ "~kind": "Inferrable" }, {
		name,
		type
	}, {});
}
function IsInferable(value) {
	return IsObject$1(value) && HasPropertyKey(value, "~kind") && HasPropertyKey(value, "name") && HasPropertyKey(value, "type") && IsEqual(value["~kind"], "Inferrable") && IsString$2(value.name) && IsObject$1(value.type);
}
function TryRestInferable(type) {
	return IsRest(type) ? IsInfer(type.items) ? IsArray(type.items.extends) ? Inferrable(type.items.name, type.items.extends.items) : IsUnknown(type.items.extends) ? Inferrable(type.items.name, type.items.extends) : void 0 : Unreachable() : void 0;
}
function TryInferable(type) {
	return IsInfer(type) ? Inferrable(type.name, type.extends) : void 0;
}
function TryInferResults(rest, right, result = []) {
	return TakeLeft(rest, (head, tail) => Match(ExtendsLeft({}, head, right), () => TryInferResults(tail, right, [...result, head]), () => void 0), () => result);
}
function InferTupleResult(inferred, name, left, right) {
	const results = TryInferResults(left, right);
	return IsArray$1(results) ? ExtendsTrue(Assign(inferred, { [name]: Tuple(results) })) : ExtendsFalse();
}
function InferUnionResult(inferred, name, left, right) {
	const results = TryInferResults(left, right);
	return IsArray$1(results) ? ExtendsTrue(Assign(inferred, { [name]: Union(results) })) : ExtendsFalse();
}
//#endregion
//#region node_modules/typebox/build/type/extends/tuple.mjs
function Reverse(types) {
	return [...types].reverse();
}
function ApplyReverse(types, reversed) {
	return reversed ? Reverse(types) : types;
}
function Reversed(types) {
	const first = types.length > 0 ? types[0] : void 0;
	return IsSchema(IsSchema(first) ? TryRestInferable(first) : void 0);
}
function ElementsCompare(inferred, reversed, left, leftRest, right, rightRest) {
	return Match(ExtendsLeft(inferred, left, right), (checkInferred) => Elements(checkInferred, reversed, leftRest, rightRest), () => ExtendsFalse());
}
function ElementsLeft(inferred, reversed, leftRest, right, rightRest) {
	const inferable = TryRestInferable(right);
	return IsInferable(inferable) ? InferTupleResult(inferred, inferable["name"], ApplyReverse(leftRest, reversed), inferable["type"]) : TakeLeft(leftRest, (head, tail) => ElementsCompare(inferred, reversed, head, tail, right, rightRest), () => ExtendsFalse());
}
function ElementsRight(inferred, reversed, leftRest, rightRest) {
	return TakeLeft(rightRest, (head, tail) => ElementsLeft(inferred, reversed, leftRest, head, tail), () => IsEqual(leftRest.length, 0) ? ExtendsTrue(inferred) : ExtendsFalse());
}
function Elements(inferred, reversed, leftRest, rightRest) {
	return ElementsRight(inferred, reversed, leftRest, rightRest);
}
function ExtendsTupleToTuple(inferred, left, right) {
	const instantiatedRight = InstantiateElements(inferred, { callstack: [] }, right);
	const reversed = Reversed(instantiatedRight);
	return Elements(inferred, reversed, ApplyReverse(left, reversed), ApplyReverse(instantiatedRight, reversed));
}
function ExtendsTupleToArray(inferred, left, right) {
	const inferrable = TryInferable(right);
	return IsInferable(inferrable) ? InferUnionResult(inferred, inferrable["name"], left, inferrable["type"]) : TakeLeft(left, (head, tail) => Match(ExtendsLeft(inferred, head, right), (inferred) => ExtendsTupleToArray(inferred, tail, right), () => ExtendsFalse()), () => ExtendsTrue(inferred));
}
function ExtendsTuple(inferred, left, right) {
	const instantiatedLeft = InstantiateElements(inferred, { callstack: [] }, left);
	return IsTuple(right) ? ExtendsTupleToTuple(inferred, instantiatedLeft, right.items) : IsArray(right) ? ExtendsTupleToArray(inferred, instantiatedLeft, right.items) : ExtendsRight(inferred, Tuple(instantiatedLeft), right);
}
//#endregion
//#region node_modules/typebox/build/type/extends/undefined.mjs
function ExtendsUndefined(inferred, left, right) {
	return IsVoid(right) ? ExtendsTrue(inferred) : IsUndefined(right) ? ExtendsTrue(inferred) : ExtendsRight(inferred, left, right);
}
//#endregion
//#region node_modules/typebox/build/type/extends/union.mjs
function ExtendsUnionSome(inferred, type, unionTypes) {
	return TakeLeft(unionTypes, (head, tail) => Match(ExtendsLeft(inferred, type, head), (inferred) => ExtendsTrue(inferred), () => ExtendsUnionSome(inferred, type, tail)), () => ExtendsFalse());
}
function ExtendsUnionLeft(inferred, left, right) {
	return TakeLeft(left, (head, tail) => Match(ExtendsUnionSome(inferred, head, right), (inferred) => ExtendsUnionLeft(inferred, tail, right), () => ExtendsFalse()), () => ExtendsTrue(inferred));
}
function ExtendsUnion(inferred, left, right) {
	const inferrable = TryInferable(right);
	return IsInferable(inferrable) ? InferUnionResult(inferred, inferrable.name, left, inferrable.type) : IsUnion(right) ? ExtendsUnionLeft(inferred, left, right.anyOf) : ExtendsUnionLeft(inferred, left, [right]);
}
//#endregion
//#region node_modules/typebox/build/type/extends/unknown.mjs
function ExtendsUnknown(inferred, left, right) {
	return IsInfer(right) ? ExtendsRight(inferred, left, right) : IsAny(right) ? ExtendsTrue(inferred) : IsUnknown(right) ? ExtendsTrue(inferred) : ExtendsFalse();
}
//#endregion
//#region node_modules/typebox/build/type/extends/void.mjs
function ExtendsVoid(inferred, left, right) {
	return IsVoid(right) ? ExtendsTrue(inferred) : ExtendsRight(inferred, left, right);
}
//#endregion
//#region node_modules/typebox/build/type/extends/extends_left.mjs
function ExtendsLeft(inferred, left, right) {
	return IsAny(left) ? ExtendsAny(inferred, left, right) : IsArray(left) ? ExtendsArray(inferred, left, left.items, right) : IsAsyncIterator(left) ? ExtendsAsyncIterator(inferred, left.iteratorItems, right) : IsBigInt(left) ? ExtendsBigInt(inferred, left, right) : IsBoolean(left) ? ExtendsBoolean(inferred, left, right) : IsConstructor(left) ? ExtendsConstructor(inferred, left.parameters, left.instanceType, right) : IsEnum(left) ? ExtendsEnum(inferred, left, right) : IsFunction(left) ? ExtendsFunction(inferred, left.parameters, left.returnType, right) : IsInteger(left) ? ExtendsInteger(inferred, left, right) : IsIntersect(left) ? ExtendsIntersect(inferred, left.allOf, right) : IsIterator(left) ? ExtendsIterator(inferred, left.iteratorItems, right) : IsLiteral(left) ? ExtendsLiteral(inferred, left, right) : IsNever(left) ? ExtendsNever(inferred, left, right) : IsNull(left) ? ExtendsNull(inferred, left, right) : IsNumber(left) ? ExtendsNumber(inferred, left, right) : IsObject(left) ? ExtendsObject(inferred, left.properties, right) : IsPromise(left) ? ExtendsPromise(inferred, left.item, right) : IsString(left) ? ExtendsString(inferred, left, right) : IsSymbol(left) ? ExtendsSymbol(inferred, left, right) : IsTemplateLiteral(left) ? ExtendsTemplateLiteral(inferred, left.pattern, right) : IsTuple(left) ? ExtendsTuple(inferred, left.items, right) : IsUndefined(left) ? ExtendsUndefined(inferred, left, right) : IsUnion(left) ? ExtendsUnion(inferred, left.anyOf, right) : IsUnknown(left) ? ExtendsUnknown(inferred, left, right) : IsVoid(left) ? ExtendsVoid(inferred, left, right) : ExtendsFalse();
}
//#endregion
//#region node_modules/typebox/build/type/engine/interface/instantiate.mjs
function InterfaceOperation(heritage, properties) {
	return EvaluateIntersect([...heritage, _Object_(properties)]);
}
function InterfaceAction(heritage, properties, options) {
	return CanInstantiate(heritage) ? Update(InterfaceOperation(heritage, properties), {}, options) : InterfaceDeferred(heritage, properties, options);
}
function InterfaceInstantiate(context, state, heritage, properties, options) {
	return InterfaceAction(InstantiateTypes(context, state, heritage), InstantiateProperties(context, state, properties), options);
}
//#endregion
//#region node_modules/typebox/build/type/action/interface.mjs
/** Creates a deferred Interface action. */
function InterfaceDeferred(heritage, properties, options = {}) {
	return Deferred("Interface", [heritage, properties], options);
}
/** Returns true if this value is a deferred Interface action. */
function IsInterfaceDeferred(value) {
	return IsSchema(value) && HasPropertyKey(value, "action") && IsEqual(value.action, "Interface");
}
//#endregion
//#region node_modules/typebox/build/type/engine/cyclic/check.mjs
function FromRef$3(stack, context, ref) {
	return stack.includes(ref) ? true : FromType$15([...stack, ref], context, context[ref]);
}
function FromProperties$2(stack, context, properties) {
	return FromTypes$3(stack, context, PropertyValues(properties));
}
function FromTypes$3(stack, context, types) {
	return TakeLeft(types, (left, right) => FromType$15(stack, context, left) ? true : FromTypes$3(stack, context, right), () => false);
}
function FromType$15(stack, context, type) {
	return IsRef(type) ? FromRef$3(stack, context, type.$ref) : IsArray(type) ? FromType$15(stack, context, type.items) : IsAsyncIterator(type) ? FromType$15(stack, context, type.iteratorItems) : IsConstructor(type) ? FromTypes$3(stack, context, [...type.parameters, type.instanceType]) : IsFunction(type) ? FromTypes$3(stack, context, [...type.parameters, type.returnType]) : IsInterfaceDeferred(type) ? FromProperties$2(stack, context, type.parameters[1]) : IsIntersect(type) ? FromTypes$3(stack, context, type.allOf) : IsIterator(type) ? FromType$15(stack, context, type.iteratorItems) : IsObject(type) ? FromProperties$2(stack, context, type.properties) : IsPromise(type) ? FromType$15(stack, context, type.item) : IsUnion(type) ? FromTypes$3(stack, context, type.anyOf) : IsTuple(type) ? FromTypes$3(stack, context, type.items) : IsRecord(type) ? FromType$15(stack, context, RecordValue(type)) : false;
}
/** Performs a cyclic check on the given type. Initial key stack can be empty, but faster if specified */
function CyclicCheck(stack, context, type) {
	return FromType$15(stack, context, type);
}
//#endregion
//#region node_modules/typebox/build/type/engine/cyclic/candidates.mjs
function ResolveCandidateKeys(context, keys) {
	return keys.reduce((result, left) => {
		return left in context ? CyclicCheck([left], context, context[left]) ? [...result, left] : result : Unreachable();
	}, []);
}
/** Returns keys for context types that need to be transformed to TCyclic. */
function CyclicCandidates(context) {
	return ResolveCandidateKeys(context, PropertyKeys(context));
}
//#endregion
//#region node_modules/typebox/build/type/engine/cyclic/dependencies.mjs
function FromRef$2(context, ref, result) {
	return result.includes(ref) ? result : ref in context ? FromType$14(context, context[ref], [...result, ref]) : Unreachable();
}
function FromProperties$1(context, properties, result) {
	return FromTypes$2(context, PropertyValues(properties), result);
}
function FromTypes$2(context, types, result) {
	return types.reduce((result, left) => {
		return FromType$14(context, left, result);
	}, result);
}
function FromType$14(context, type, result) {
	return IsRef(type) ? FromRef$2(context, type.$ref, result) : IsArray(type) ? FromType$14(context, type.items, result) : IsAsyncIterator(type) ? FromType$14(context, type.iteratorItems, result) : IsConstructor(type) ? FromTypes$2(context, [...type.parameters, type.instanceType], result) : IsFunction(type) ? FromTypes$2(context, [...type.parameters, type.returnType], result) : IsInterfaceDeferred(type) ? FromProperties$1(context, type.parameters[1], result) : IsIntersect(type) ? FromTypes$2(context, type.allOf, result) : IsIterator(type) ? FromType$14(context, type.iteratorItems, result) : IsObject(type) ? FromProperties$1(context, type.properties, result) : IsPromise(type) ? FromType$14(context, type.item, result) : IsUnion(type) ? FromTypes$2(context, type.anyOf, result) : IsTuple(type) ? FromTypes$2(context, type.items, result) : IsRecord(type) ? FromType$14(context, RecordValue(type), result) : result;
}
/** Returns dependent cyclic keys for the given type. This function is used to dead-type-eliminate (DTE) for initializing TCyclic types. */
function CyclicDependencies(context, key, type) {
	return FromType$14(context, type, [key]);
}
//#endregion
//#region node_modules/typebox/build/type/engine/cyclic/extends.mjs
function FromRef$1(_ref) {
	return Any();
}
function FromProperties(properties) {
	return Keys(properties).reduce((result, key) => {
		return {
			...result,
			[key]: FromType$13(properties[key])
		};
	}, {});
}
function FromTypes$1(types) {
	return types.reduce((result, left) => {
		return [...result, FromType$13(left)];
	}, []);
}
function FromType$13(type) {
	return IsRef(type) ? FromRef$1(type.$ref) : IsArray(type) ? _Array_(FromType$13(type.items), ArrayOptions(type)) : IsAsyncIterator(type) ? AsyncIterator(FromType$13(type.iteratorItems)) : IsConstructor(type) ? Constructor(FromTypes$1(type.parameters), FromType$13(type.instanceType)) : IsFunction(type) ? _Function_(FromTypes$1(type.parameters), FromType$13(type.returnType)) : IsIntersect(type) ? Intersect(FromTypes$1(type.allOf)) : IsIterator(type) ? Iterator(FromType$13(type.iteratorItems)) : IsObject(type) ? _Object_(FromProperties(type.properties)) : IsPromise(type) ? _Promise_(FromType$13(type.item)) : IsRecord(type) ? Record(RecordKey(type), FromType$13(RecordValue(type))) : IsUnion(type) ? Union(FromTypes$1(type.anyOf)) : IsTuple(type) ? Tuple(FromTypes$1(type.items)) : type;
}
function CyclicAnyFromParameters(defs, ref) {
	return ref in defs ? FromType$13(defs[ref]) : Unknown();
}
/** Transforms TCyclic TRef's into TAny's. This function is used prior to TExtends checks to enable cyclics to be structurally checked and terminated (with TAny) at first point of recursion, what would otherwise be a recursive TRef.*/
function CyclicExtends(type) {
	return CyclicAnyFromParameters(type.$defs, type.$ref);
}
//#endregion
//#region node_modules/typebox/build/type/engine/cyclic/instantiate.mjs
function CyclicInterface(context, heritage, properties) {
	const instantiatedHeritage = InstantiateTypes(context, { callstack: [] }, heritage);
	const instantiatedProperties = InstantiateProperties({}, { callstack: [] }, properties);
	return EvaluateIntersect([...instantiatedHeritage, _Object_(instantiatedProperties)]);
}
function CyclicDefinitions(context, dependencies) {
	return Keys(context).filter((key) => dependencies.includes(key)).reduce((result, key) => {
		const type = context[key];
		const instantiatedType = IsInterfaceDeferred(type) ? CyclicInterface(context, type.parameters[0], type.parameters[1]) : type;
		return {
			...result,
			[key]: instantiatedType
		};
	}, {});
}
function InstantiateCyclic(context, ref, type) {
	return Cyclic(CyclicDefinitions(context, CyclicDependencies(context, ref, type)), ref);
}
//#endregion
//#region node_modules/typebox/build/type/engine/cyclic/target.mjs
function Resolve(defs, ref) {
	return ref in defs ? IsRef(defs[ref]) ? Resolve(defs, defs[ref].$ref) : defs[ref] : Never();
}
/** Returns the target Type from the Defs or Never if target is non-resolvable */
function CyclicTarget(defs, ref) {
	return Resolve(defs, ref);
}
//#endregion
//#region node_modules/typebox/build/type/extends/extends.mjs
function Canonical(type) {
	return IsCyclic(type) ? CyclicExtends(type) : IsUnsafe(type) ? Unknown() : type;
}
/** Performs a structural extends check on left and right types and yields inferred types on right if specified. */
function Extends(inferred, left, right) {
	return ExtendsLeft(inferred, Canonical(left), Canonical(right));
}
//#endregion
//#region node_modules/typebox/build/type/engine/evaluate/compare.mjs
const ResultEqual = "equal";
const ResultDisjoint = "disjoint";
const ResultLeftInside = "left-inside";
const ResultRightInside = "right-inside";
/** Compares left and right types and determines their set relationship. */
function Compare(left, right) {
	const extendsCheck = [IsUnknown(left) ? ExtendsFalse() : Extends({}, left, right), IsUnknown(left) ? ExtendsTrue({}) : Extends({}, right, left)];
	return IsExtendsTrueLike(extendsCheck[0]) && IsExtendsTrueLike(extendsCheck[1]) ? ResultEqual : IsExtendsTrueLike(extendsCheck[0]) && IsExtendsFalse(extendsCheck[1]) ? ResultLeftInside : IsExtendsFalse(extendsCheck[0]) && IsExtendsTrueLike(extendsCheck[1]) ? ResultRightInside : ResultDisjoint;
}
//#endregion
//#region node_modules/typebox/build/type/engine/evaluate/broaden.mjs
function BroadFilter(type, types) {
	return types.filter((left) => {
		return Compare(type, left) === "right-inside" ? false : true;
	});
}
function IsBroadestType(type, types) {
	return IsEqual(types.some((left) => {
		const result = Compare(type, left);
		return IsEqual(result, "left-inside") || IsEqual(result, "equal");
	}), false);
}
function BroadenType(type, types) {
	const evaluated = EvaluateType(type);
	return IsAny(evaluated) ? [evaluated] : IsBroadestType(evaluated, types) ? [...BroadFilter(evaluated, types), evaluated] : types;
}
function BroadenTypes(types) {
	return types.reduce((result, left) => {
		return IsObject(left) ? [...result, left] : IsNever(left) ? result : BroadenType(left, result);
	}, []);
}
/** Broadens a set of types and returns either the most broad type, or union or disjoint types. */
function Broaden(types) {
	const flattened = Flatten(BroadenTypes(types));
	return flattened.length === 0 ? Never() : flattened.length === 1 ? flattened[0] : Union(flattened);
}
//#endregion
//#region node_modules/typebox/build/type/engine/evaluate/instantiate.mjs
function EvaluateAction(type, options) {
	return Update(EvaluateType(type), {}, options);
}
function EvaluateInstantiate(context, state, type, options) {
	return EvaluateAction(InstantiateType(context, state, type), options);
}
//#endregion
//#region node_modules/typebox/build/type/engine/call/distribute_arguments.mjs
function CollectDistributionNames(expression, result = []) {
	return IsDeferred(expression) && IsEqual(expression.action, "Conditional") ? IsRef(expression.parameters[0]) ? CollectDistributionNames(expression.parameters[2], CollectDistributionNames(expression.parameters[3], [...result, expression.parameters[0]["$ref"]])) : CollectDistributionNames(expression.parameters[2], CollectDistributionNames(expression.parameters[3], result)) : IsDeferred(expression) && IsEqual(expression.action, "Mapped") ? IsDeferred(expression.parameters[1]) && IsEqual(expression.parameters[1].action, "KeyOf") && IsRef(expression.parameters[1].parameters[0]) ? [...result, expression.parameters[1].parameters[0]["$ref"]] : result : result;
}
function BuildDistributionArray(parameters, names) {
	return parameters.reduce((result, left) => [...result, names.includes(left.name)], []);
}
function ZipDistributionArray(arguments_, distributionArray, result = []) {
	return TakeLeft(arguments_, (argumentLeft, argumentRight) => TakeLeft(distributionArray, (booleanLeft, booleanRight) => ZipDistributionArray(argumentRight, booleanRight, [...result, [booleanLeft, argumentLeft]]), () => result), () => result);
}
function Expand(type) {
	return IsUnion(type) ? [...type.anyOf] : [type];
}
function Append(current, type) {
	return current.reduce((result, left) => [...result, [...left, type]], []);
}
function Cross(current, variants) {
	return variants.reduce((result, left) => {
		return [...result, ...Append(current, left)];
	}, []);
}
function Distribute(zipped) {
	return zipped.reduce((result, left) => {
		return IsEqual(left[0], true) ? Cross(result, Expand(left[1])) : Cross(result, [left[1]]);
	}, [[]]);
}
function DistributeArguments(parameters, arguments_, expression) {
	const zippedArguments = ZipDistributionArray(arguments_, BuildDistributionArray(parameters, CollectDistributionNames(expression)));
	return IsDeferred(expression) && IsEqual(expression.action, "Conditional") ? Distribute(zippedArguments) : IsDeferred(expression) && IsEqual(expression.action, "Mapped") ? Distribute(zippedArguments) : [arguments_];
}
//#endregion
//#region node_modules/typebox/build/type/engine/call/resolve_target.mjs
function FromNotResolvable() {
	return ["(not-resolvable)", Never()];
}
function FromNotGeneric() {
	return ["(not-generic)", Never()];
}
function FromGeneric(name, parameters, expression) {
	return [name, Generic(parameters, expression)];
}
function FromRef(context, ref, arguments_) {
	return ref in context ? FromType$12(context, ref, context[ref], arguments_) : FromNotResolvable();
}
function FromType$12(context, name, target, arguments_) {
	return IsGeneric(target) ? FromGeneric(name, target.parameters, target.expression) : IsRef(target) ? FromRef(context, target.$ref, arguments_) : FromNotGeneric();
}
/** Resolves a named generic target from the context, or returns TNever if it cannot be resolved or is not generic. */
function ResolveTarget(context, target, arguments_) {
	return FromType$12(context, "(anonymous)", target, arguments_);
}
//#endregion
//#region node_modules/typebox/build/type/engine/call/resolve_arguments.mjs
function AssertArgumentExtends(name, type, extends_) {
	if (IsInfer(type) || IsCall(type) || IsExtendsTrueLike(Extends({}, type, extends_))) return;
	const cause = {
		parameter: name,
		expect: extends_,
		actual: type
	};
	throw new Error(`Argument for parameter ${name} does not satisfy constraint`, { cause });
}
function BindArgument(context, state, name, extends_, type) {
	const instantiatedArgument = InstantiateType(context, state, type);
	AssertArgumentExtends(name, instantiatedArgument, extends_);
	return Assign(context, { [name]: instantiatedArgument });
}
function BindArguments(context, state, parameterLeft, parameterRight, arguments_) {
	const instantiatedExtends = InstantiateType(context, state, parameterLeft.extends);
	const instantiatedEquals = InstantiateType(context, state, parameterLeft.equals);
	return TakeLeft(arguments_, (left, right) => BindParameters(BindArgument(context, state, parameterLeft["name"], instantiatedExtends, left), state, parameterRight, right), () => BindParameters(BindArgument(context, state, parameterLeft["name"], instantiatedExtends, instantiatedEquals), state, parameterRight, []));
}
function BindParameters(context, state, parameters, arguments_) {
	return TakeLeft(parameters, (left, right) => BindArguments(context, state, left, right, arguments_), () => context);
}
function ResolveArgumentsContext(context, state, parameters, arguments_) {
	return BindParameters(context, state, parameters, arguments_);
}
//#endregion
//#region node_modules/typebox/build/type/engine/call/instantiate.mjs
function Peek(state) {
	return IsGreaterThan(state.callstack.length, 0) ? state.callstack[state.callstack.length - 1] : "";
}
function IsTailCall(state, name) {
	return IsEqual(Peek(state), name);
}
function CallDispatch(context, state, target, parameters, expression, arguments_) {
	return InstantiateType(context, state, InstantiateType(ResolveArgumentsContext(context, state, parameters, arguments_), { callstack: [...state.callstack, target.$ref] }, expression));
}
function CallDistributed(context, state, target, parameters, expression, distributedArguments) {
	return distributedArguments.reduce((result, arguments_) => [...result, CallDispatch(context, state, target, parameters, expression, arguments_)], []);
}
function CallImmediate(context, state, target, parameters, expression, arguments_) {
	const returnTypes = CallDistributed(context, state, target, parameters, expression, DistributeArguments(parameters, arguments_, expression));
	return IsEqual(returnTypes.length, 1) ? returnTypes[0] : EvaluateUnion(returnTypes);
}
function CallInstantiate(context, state, target, arguments_) {
	const instantiatedArguments = InstantiateTypes(context, state, arguments_);
	const resolved = ResolveTarget(context, target, arguments_);
	const name = resolved[0];
	const type = resolved[1];
	return IsGeneric(type) ? IsTailCall(state, name) ? CallConstruct(Ref(name), instantiatedArguments) : CallImmediate(context, state, Ref(name), type.parameters, type.expression, instantiatedArguments) : CallConstruct(target, instantiatedArguments);
}
//#endregion
//#region node_modules/typebox/build/type/types/call.mjs
function CallConstruct(target, arguments_) {
	return Create({ ["~kind"]: "Call" }, {
		target,
		arguments: arguments_
	}, {});
}
/** Returns true if the given type is a TCall. */
function IsCall(value) {
	return IsKind(value, "Call");
}
//#endregion
//#region node_modules/typebox/build/type/engine/intrinsics/mapping.mjs
function ApplyMapping(mapping, value) {
	return mapping(value);
}
//#endregion
//#region node_modules/typebox/build/type/engine/intrinsics/from_literal.mjs
function FromLiteral$2(mapping, value) {
	return IsString$2(value) ? Literal(ApplyMapping(mapping, value)) : Literal(value);
}
//#endregion
//#region node_modules/typebox/build/type/engine/intrinsics/from_template_literal.mjs
function FromTemplateLiteral$2(mapping, pattern) {
	return FromType$11(mapping, TemplateLiteralDecode(pattern));
}
//#endregion
//#region node_modules/typebox/build/type/engine/intrinsics/from_union.mjs
function FromUnion$6(mapping, types) {
	return Union(types.map((type) => FromType$11(mapping, type)));
}
//#endregion
//#region node_modules/typebox/build/type/engine/intrinsics/from_type.mjs
function FromType$11(mapping, type) {
	return IsLiteral(type) ? FromLiteral$2(mapping, type.const) : IsTemplateLiteral(type) ? FromTemplateLiteral$2(mapping, type.pattern) : IsUnion(type) ? FromUnion$6(mapping, type.anyOf) : type;
}
//#endregion
//#region node_modules/typebox/build/type/action/capitalize.mjs
/** Creates a deferred Capitalize action. */
function CapitalizeDeferred(type, options = {}) {
	return Deferred("Capitalize", [type], options);
}
//#endregion
//#region node_modules/typebox/build/type/action/lowercase.mjs
/** Creates a deferred Lowercase action. */
function LowercaseDeferred(type, options = {}) {
	return Deferred("Lowercase", [type], options);
}
//#endregion
//#region node_modules/typebox/build/type/action/uncapitalize.mjs
/** Creates a deferred Uncapitalize action. */
function UncapitalizeDeferred(type, options = {}) {
	return Deferred("Uncapitalize", [type], options);
}
//#endregion
//#region node_modules/typebox/build/type/action/uppercase.mjs
/** Creates a deferred Uppercase action. */
function UppercaseDeferred(type, options = {}) {
	return Deferred("Uppercase", [type], options);
}
//#endregion
//#region node_modules/typebox/build/type/engine/intrinsics/instantiate.mjs
const CapitalizeMapping = (input) => input[0].toUpperCase() + input.slice(1);
const LowercaseMapping = (input) => input.toLowerCase();
const UncapitalizeMapping = (input) => input[0].toLowerCase() + input.slice(1);
const UppercaseMapping = (input) => input.toUpperCase();
function CapitalizeAction(type, options) {
	return CanInstantiate([type]) ? Update(FromType$11(CapitalizeMapping, type), {}, options) : CapitalizeDeferred(type, options);
}
function LowercaseAction(type, options) {
	return CanInstantiate([type]) ? Update(FromType$11(LowercaseMapping, type), {}, options) : LowercaseDeferred(type, options);
}
function UncapitalizeAction(type, options) {
	return CanInstantiate([type]) ? Update(FromType$11(UncapitalizeMapping, type), {}, options) : UncapitalizeDeferred(type, options);
}
function UppercaseAction(type, options) {
	return CanInstantiate([type]) ? Update(FromType$11(UppercaseMapping, type), {}, options) : UppercaseDeferred(type, options);
}
function CapitalizeInstantiate(context, state, type, options) {
	return CapitalizeAction(InstantiateType(context, state, type), options);
}
function LowercaseInstantiate(context, state, type, options) {
	return LowercaseAction(InstantiateType(context, state, type), options);
}
function UncapitalizeInstantiate(context, state, type, options) {
	return UncapitalizeAction(InstantiateType(context, state, type), options);
}
function UppercaseInstantiate(context, state, type, options) {
	return UppercaseAction(InstantiateType(context, state, type), options);
}
//#endregion
//#region node_modules/typebox/build/type/action/conditional.mjs
/** Creates a deferred Conditional action. */
function ConditionalDeferred(left, right, true_, false_, options = {}) {
	return Deferred("Conditional", [
		left,
		right,
		true_,
		false_
	], options);
}
//#endregion
//#region node_modules/typebox/build/type/engine/conditional/instantiate.mjs
function ConditionalOperation(context, state, left, right, true_, false_) {
	const extendsResult = Extends(context, left, right);
	return IsExtendsUnion(extendsResult) ? Union([InstantiateType(extendsResult.inferred, state, true_), InstantiateType(context, state, false_)]) : IsExtendsTrue(extendsResult) ? InstantiateType(extendsResult.inferred, state, true_) : InstantiateType(context, state, false_);
}
function ConditionalAction(context, state, left, right, true_, false_, options) {
	return CanInstantiate([left, right]) ? Update(ConditionalOperation(context, state, left, right, true_, false_), {}, options) : ConditionalDeferred(left, right, true_, false_, options);
}
function ConditionalInstantiate(context, state, left, right, true_, false_, options) {
	return ConditionalAction(context, state, InstantiateType(context, state, left), InstantiateType(context, state, right), true_, false_, options);
}
//#endregion
//#region node_modules/typebox/build/type/action/constructor_parameters.mjs
/** Creates a deferred ConstructorParameters action. */
function ConstructorParametersDeferred(type, options = {}) {
	return Deferred("ConstructorParameters", [type], options);
}
//#endregion
//#region node_modules/typebox/build/type/engine/constructor_parameters/instantiate.mjs
function ConstructorParametersOperation(type) {
	return Tuple(InstantiateElements({}, { callstack: [] }, IsConstructor(type) ? type["parameters"] : []));
}
function ConstructorParametersAction(type, options) {
	return CanInstantiate([type]) ? Update(ConstructorParametersOperation(type), {}, options) : ConstructorParametersDeferred(type, options);
}
function ConstructorParametersInstantiate(context, state, type, options) {
	return ConstructorParametersAction(InstantiateType(context, state, type), options);
}
//#endregion
//#region node_modules/typebox/build/type/action/exclude.mjs
/** Creates a deferred Exclude action. */
function ExcludeDeferred(left, right, options = {}) {
	return Deferred("Exclude", [left, right], options);
}
//#endregion
//#region node_modules/typebox/build/type/engine/exclude/operation.mjs
function ExcludeUnionLeft(types, right) {
	return types.reduce((result, head) => {
		return [...result, ...ExcludeTypeLeft(head, right)];
	}, []);
}
function ExcludeTypeLeft(left, right) {
	return IsExtendsTrueLike(Extends({}, left, right)) ? [] : [left];
}
function ExcludeOperation(left, right) {
	return EvaluateUnion(IsEnum(left) ? ExcludeUnionLeft(EnumValuesToVariants(left.enum), right) : IsUnion(left) ? ExcludeUnionLeft(Flatten(left.anyOf), right) : ExcludeTypeLeft(left, right));
}
//#endregion
//#region node_modules/typebox/build/type/engine/exclude/instantiate.mjs
function ExcludeAction(left, right, options) {
	return CanInstantiate([left, right]) ? Update(ExcludeOperation(left, right), {}, options) : ExcludeDeferred(left, right, options);
}
function ExcludeInstantiate(context, state, left, right, options) {
	return ExcludeAction(InstantiateType(context, state, left), InstantiateType(context, state, right), options);
}
//#endregion
//#region node_modules/typebox/build/type/action/extract.mjs
/** Creates a deferred Extract action. */
function ExtractDeferred(left, right, options = {}) {
	return Deferred("Extract", [left, right], options);
}
//#endregion
//#region node_modules/typebox/build/type/engine/extract/operation.mjs
function ExtractUnionLeft(types, right) {
	return types.reduce((result, head) => {
		return [...result, ...ExtractTypeLeft(head, right)];
	}, []);
}
function ExtractTypeLeft(left, right) {
	return IsExtendsTrueLike(Extends({}, left, right)) ? [left] : [];
}
function ExtractOperation(left, right) {
	return EvaluateUnion(IsEnum(left) ? ExtractUnionLeft(EnumValuesToVariants(left.enum), right) : IsUnion(left) ? ExtractUnionLeft(Flatten(left.anyOf), right) : ExtractTypeLeft(left, right));
}
//#endregion
//#region node_modules/typebox/build/type/engine/extract/instantiate.mjs
function ExtractAction(left, right, options) {
	return CanInstantiate([left, right]) ? Update(ExtractOperation(left, right), {}, options) : ExtractDeferred(left, right, options);
}
function ExtractInstantiate(context, state, left, right, options) {
	return ExtractAction(InstantiateType(context, state, left), InstantiateType(context, state, right), options);
}
//#endregion
//#region node_modules/typebox/build/type/action/indexed.mjs
/** Creates a deferred Index action. */
function IndexDeferred(type, indexer, options = {}) {
	return Deferred("Index", [type, indexer], options);
}
//#endregion
//#region node_modules/typebox/build/type/engine/object/from_cyclic.mjs
function FromCyclic$4(defs, ref) {
	return FromType$10(CyclicTarget(defs, ref));
}
//#endregion
//#region node_modules/typebox/build/type/engine/object/from_intersect.mjs
function CollapseIntersectProperties(left, right) {
	const leftKeys = Keys(left).filter((key) => !HasPropertyKey(right, key));
	const rightKeys = Keys(right).filter((key) => !HasPropertyKey(left, key));
	const sharedKeys = Keys(left).filter((key) => HasPropertyKey(right, key));
	const leftProperties = leftKeys.reduce((result, key) => ({
		...result,
		[key]: left[key]
	}), {});
	const rightProperties = rightKeys.reduce((result, key) => ({
		...result,
		[key]: right[key]
	}), {});
	const sharedProperties = sharedKeys.reduce((result, key) => ({
		...result,
		[key]: EvaluateIntersect([left[key], right[key]])
	}), {});
	return Assign(Assign(leftProperties, rightProperties), sharedProperties);
}
function FromIntersect$4(types) {
	return types.reduce((result, left) => {
		return CollapseIntersectProperties(result, FromType$10(left));
	}, {});
}
//#endregion
//#region node_modules/typebox/build/type/engine/object/from_object.mjs
function FromObject$5(properties) {
	return properties;
}
//#endregion
//#region node_modules/typebox/build/type/engine/object/from_tuple.mjs
function FromTuple$3(types) {
	return FromType$10(TupleToObject(Tuple(types)));
}
//#endregion
//#region node_modules/typebox/build/type/engine/object/from_union.mjs
function CollapseUnionProperties(left, right) {
	return Keys(left).filter((key) => key in right).reduce((result, key) => {
		return {
			...result,
			[key]: EvaluateUnion([left[key], right[key]])
		};
	}, {});
}
function ReduceVariants(types, result) {
	return TakeLeft(types, (left, right) => ReduceVariants(right, CollapseUnionProperties(result, FromType$10(left))), () => result);
}
function FromUnion$5(types) {
	return TakeLeft(types, (left, right) => ReduceVariants(right, FromType$10(left)), () => Unreachable());
}
//#endregion
//#region node_modules/typebox/build/type/engine/object/from_type.mjs
function FromType$10(type) {
	return IsCyclic(type) ? FromCyclic$4(type.$defs, type.$ref) : IsIntersect(type) ? FromIntersect$4(type.allOf) : IsUnion(type) ? FromUnion$5(type.anyOf) : IsTuple(type) ? FromTuple$3(type.items) : IsObject(type) ? FromObject$5(type.properties) : {};
}
//#endregion
//#region node_modules/typebox/build/type/engine/object/collapse.mjs
/**
* Collapses a type into a TObject schema. This is a lossy fast path used to
* normalize arbitrary TSchema types into a TObject structure. This function is
* primarily used in indexing operations where a normalized object structure
* is required. If the type cannot be collapsed, an empty object schema is returned.
*/
function CollapseToObject(type) {
	return _Object_(FromType$10(type));
}
//#endregion
//#region node_modules/typebox/build/type/engine/helpers/keys.mjs
const integerKeyPattern = /* @__PURE__ */ new RegExp("^(?:0|[1-9][0-9]*)$");
function ConvertToIntegerKey(value) {
	const normal = `${value}`;
	return integerKeyPattern.test(normal) ? parseInt(normal) : value;
}
//#endregion
//#region node_modules/typebox/build/type/engine/indexed/from_array.mjs
function NormalizeLiteral(value) {
	return Literal(ConvertToIntegerKey(value));
}
function NormalizeIndexerTypes(types) {
	return types.map((type) => NormalizeIndexer(type));
}
function NormalizeIndexer(type) {
	return IsIntersect(type) ? Intersect(NormalizeIndexerTypes(type.allOf)) : IsUnion(type) ? Union(NormalizeIndexerTypes(type.anyOf)) : IsLiteral(type) ? NormalizeLiteral(type.const) : type;
}
function FromArray$2(type, indexer) {
	return IsExtendsTrueLike(Extends({}, NormalizeIndexer(indexer), Number$1())) ? type : IsLiteral(indexer) && IsEqual(indexer.const, "length") ? Number$1() : Never();
}
//#endregion
//#region node_modules/typebox/build/type/engine/indexable/from_cyclic.mjs
function FromCyclic$3(defs, ref) {
	return FromType$9(CyclicTarget(defs, ref));
}
//#endregion
//#region node_modules/typebox/build/type/engine/indexable/from_union.mjs
function FromUnion$4(types) {
	return types.reduce((result, left) => {
		return [...result, ...FromType$9(left)];
	}, []);
}
//#endregion
//#region node_modules/typebox/build/type/engine/indexable/from_enum.mjs
function FromEnum(values) {
	return FromUnion$4(EnumValuesToVariants(values));
}
//#endregion
//#region node_modules/typebox/build/type/engine/indexable/from_intersect.mjs
function FromIntersect$3(types) {
	return FromType$9(EvaluateIntersect(types));
}
//#endregion
//#region node_modules/typebox/build/type/engine/indexable/from_literal.mjs
function FromLiteral$1(value) {
	return [`${value}`];
}
//#endregion
//#region node_modules/typebox/build/type/engine/indexable/from_template_literal.mjs
function FromTemplateLiteral$1(pattern) {
	return FromType$9(TemplateLiteralDecode(pattern));
}
//#endregion
//#region node_modules/typebox/build/type/engine/indexable/from_type.mjs
function FromType$9(type) {
	return IsCyclic(type) ? FromCyclic$3(type.$defs, type.$ref) : IsEnum(type) ? FromEnum(type.enum) : IsIntersect(type) ? FromIntersect$3(type.allOf) : IsLiteral(type) ? FromLiteral$1(type.const) : IsTemplateLiteral(type) ? FromTemplateLiteral$1(type.pattern) : IsUnion(type) ? FromUnion$4(type.anyOf) : [];
}
//#endregion
//#region node_modules/typebox/build/type/engine/indexable/to_indexable_keys.mjs
/**
* Transforms a type meant as an Indexer into string[] array which is used by Indexable types
* like Index, Pick and Omit to select from property keys. This function should only be used
* for Object key selection, and not for Array / Tuple key selection as Array-Like structures
* require TNumber indexing support.
*/
function ToIndexableKeys(type) {
	return FromType$9(type);
}
//#endregion
//#region node_modules/typebox/build/type/engine/this/expand_this.mjs
function FromTypes(properties, types) {
	return types.map((type) => FromType$8(properties, type));
}
function FromType$8(properties, type) {
	return IsArray(type) ? _Array_(FromType$8(properties, type.items)) : IsAsyncIterator(type) ? AsyncIterator(FromType$8(properties, type.iteratorItems)) : IsConstructor(type) ? Constructor(FromTypes(properties, type.parameters), FromType$8(properties, type.instanceType)) : IsFunction(type) ? _Function_(FromTypes(properties, type.parameters), FromType$8(properties, type.returnType)) : IsIterator(type) ? Iterator(FromType$8(properties, type.iteratorItems)) : IsPromise(type) ? _Promise_(FromType$8(properties, type.item)) : IsTuple(type) ? Tuple(FromTypes(properties, type.items)) : IsUnion(type) ? Union(FromTypes(properties, type.anyOf)) : IsIntersect(type) ? Intersect(FromTypes(properties, type.allOf)) : IsThis(type) ? _Object_(properties) : type;
}
function ExpandThis(properties, type) {
	return FromType$8(properties, type);
}
//#endregion
//#region node_modules/typebox/build/type/engine/indexed/from_object.mjs
function IndexProperty(properties, key) {
	return ExpandThis(properties, key in properties ? properties[key] : Never());
}
function IndexProperties(properties, keys) {
	return keys.reduce((result, left) => {
		return [...result, IndexProperty(properties, left)];
	}, []);
}
function FromIndexer(properties, indexer) {
	return EvaluateUnion(IndexProperties(properties, ToIndexableKeys(indexer)));
}
const NumericKeyPattern = new RegExp(IntegerKey);
function NumericKeys(keys) {
	return keys.filter((key) => NumericKeyPattern.test(key));
}
function FromIndexerNumber(properties) {
	return EvaluateUnion(IndexProperties(properties, NumericKeys(PropertyKeys(properties))));
}
function FromObject$4(properties, indexer) {
	return IsNumber(indexer) ? FromIndexerNumber(properties) : FromIndexer(properties, indexer);
}
//#endregion
//#region node_modules/typebox/build/type/engine/indexed/array_indexer.mjs
function ConvertLiteral(value) {
	return Literal(ConvertToIntegerKey(value));
}
function ArrayIndexerTypes(types) {
	return types.map((type) => FormatArrayIndexer(type));
}
/** Formats embedded integer-like strings on an Indexer to be number values inline with TS indexing | coercion behaviors. */
function FormatArrayIndexer(type) {
	return IsIntersect(type) ? Intersect(ArrayIndexerTypes(type.allOf)) : IsUnion(type) ? Union(ArrayIndexerTypes(type.anyOf)) : IsLiteral(type) ? ConvertLiteral(type.const) : type;
}
//#endregion
//#region node_modules/typebox/build/type/engine/indexed/from_tuple.mjs
function IndexElementsWithIndexer(types, indexer) {
	return types.reduceRight((result, right, index) => {
		return IsExtendsTrueLike(Extends({}, Literal(index), indexer)) ? [right, ...result] : result;
	}, []);
}
function FromTupleWithIndexer(types, indexer) {
	return EvaluateUnionFast(IndexElementsWithIndexer(types, FormatArrayIndexer(indexer)));
}
function FromTupleWithoutIndexer(types) {
	return EvaluateUnionFast(types);
}
function FromTuple$2(types, indexer) {
	return IsLiteral(indexer) && IsEqual(indexer.const, "length") ? Literal(types.length) : IsNumber(indexer) || IsInteger(indexer) ? FromTupleWithoutIndexer(types) : FromTupleWithIndexer(types, indexer);
}
//#endregion
//#region node_modules/typebox/build/type/engine/indexed/from_type.mjs
function FromType$7(type, indexer) {
	return IsArray(type) ? FromArray$2(type.items, indexer) : IsObject(type) ? FromObject$4(type.properties, indexer) : IsTuple(type) ? FromTuple$2(type.items, indexer) : Never();
}
//#endregion
//#region node_modules/typebox/build/type/engine/indexed/instantiate.mjs
function NormalizeType$1(type) {
	return IsCyclic(type) || IsIntersect(type) || IsUnion(type) ? CollapseToObject(type) : type;
}
function IndexAction(type, indexer, options) {
	return CanInstantiate([type, indexer]) ? Update(FromType$7(NormalizeType$1(type), indexer), {}, options) : IndexDeferred(type, indexer, options);
}
function IndexInstantiate(context, state, type, indexer, options) {
	return IndexAction(InstantiateType(context, state, type), InstantiateType(context, state, indexer), options);
}
//#endregion
//#region node_modules/typebox/build/type/action/instance_type.mjs
/** Creates a deferred InstanceType action. */
function InstanceTypeDeferred(type, options = {}) {
	return Deferred("InstanceType", [type], options);
}
//#endregion
//#region node_modules/typebox/build/type/engine/instance_type/instantiate.mjs
function InstanceTypeOperation(type) {
	return IsConstructor(type) ? type["instanceType"] : Never();
}
function InstanceTypeAction(type, options) {
	return CanInstantiate([type]) ? Update(InstanceTypeOperation(type), {}, options) : InstanceTypeDeferred(type, options);
}
function InstanceTypeInstantiate(context, state, type, options = {}) {
	return InstanceTypeAction(InstantiateType(context, state, type), options);
}
//#endregion
//#region node_modules/typebox/build/type/action/keyof.mjs
/** Creates a deferred KeyOf action. */
function KeyOfDeferred(type, options = {}) {
	return Deferred("KeyOf", [type], options);
}
//#endregion
//#region node_modules/typebox/build/type/engine/keyof/from_any.mjs
function FromAny() {
	return Union([
		Number$1(),
		String$1(),
		Symbol$1()
	]);
}
//#endregion
//#region node_modules/typebox/build/type/engine/keyof/from_array.mjs
function FromArray$1(_type) {
	return Number$1();
}
//#endregion
//#region node_modules/typebox/build/type/engine/keyof/from_object.mjs
function FromPropertyKeys(keys) {
	return keys.reduce((result, left) => {
		return IsLiteralValue(left) ? [...result, Literal(ConvertToIntegerKey(left))] : Unreachable();
	}, []);
}
function FromObject$3(properties) {
	return EvaluateUnionFast(FromPropertyKeys(Keys(properties)));
}
//#endregion
//#region node_modules/typebox/build/type/engine/keyof/from_record.mjs
function FromRecord(type) {
	return RecordKey(type);
}
//#endregion
//#region node_modules/typebox/build/type/engine/keyof/from_tuple.mjs
function FromTuple$1(types) {
	return EvaluateUnionFast(types.map((_, index) => Literal(index)));
}
//#endregion
//#region node_modules/typebox/build/type/engine/keyof/from_type.mjs
function FromType$6(type) {
	return IsAny(type) ? FromAny() : IsArray(type) ? FromArray$1(type.items) : IsObject(type) ? FromObject$3(type.properties) : IsRecord(type) ? FromRecord(type) : IsTuple(type) ? FromTuple$1(type.items) : Never();
}
//#endregion
//#region node_modules/typebox/build/type/engine/keyof/instantiate.mjs
function NormalizeType(type) {
	return IsCyclic(type) || IsIntersect(type) || IsUnion(type) ? CollapseToObject(type) : type;
}
function KeyOfAction(type, options) {
	return CanInstantiate([type]) ? Update(FromType$6(NormalizeType(type)), {}, options) : KeyOfDeferred(type, options);
}
function KeyOfInstantiate(context, state, type, options) {
	return KeyOfAction(InstantiateType(context, state, type), options);
}
//#endregion
//#region node_modules/typebox/build/type/action/mapped.mjs
/** Creates a deferred Mapped action. */
function MappedDeferred(identifier, type, as, property, options = {}) {
	return Deferred("Mapped", [
		identifier,
		type,
		as,
		property
	], options);
}
//#endregion
//#region node_modules/typebox/build/type/engine/mapped/mapped_variants.mjs
function FromTemplateLiteral(pattern) {
	return FromType$5(TemplateLiteralDecode(pattern));
}
function FromUnion$3(types) {
	return types.reduce((result, left) => {
		return [...result, ...FromType$5(left)];
	}, []);
}
function FromLiteral(value) {
	return IsNumber$2(value) ? [Literal(`${value}`)] : [Literal(value)];
}
function FromType$5(type) {
	return IsEnum(type) ? FromUnion$3(EnumValuesToVariants(type.enum)) : IsLiteral(type) ? FromLiteral(type.const) : IsTemplateLiteral(type) ? FromTemplateLiteral(type.pattern) : IsUnion(type) ? FromUnion$3(type.anyOf) : [type];
}
function MappedVariants(type) {
	return FromType$5(type);
}
//#endregion
//#region node_modules/typebox/build/type/engine/mapped/mapped_operation.mjs
function CanonicalAs(instantiatedAs) {
	return IsTemplateLiteral(instantiatedAs) ? TemplateLiteralDecode(instantiatedAs.pattern) : instantiatedAs;
}
function MappedVariant(context, state, identifier, variant, as, property) {
	const variantContext = Assign(context, { [identifier["name"]]: variant });
	const canonicalAs = CanonicalAs(InstantiateType(variantContext, state, as));
	const instantiatedProperty = InstantiateType(variantContext, state, property);
	return IsLiteralNumber(canonicalAs) || IsLiteralString(canonicalAs) ? { [canonicalAs.const]: instantiatedProperty } : {};
}
function MappedProperties(context, state, identifier, variants, as, property) {
	return variants.reduce((result, left) => {
		return [...result, MappedVariant(context, state, identifier, left, as, property)];
	}, []);
}
function MappedObjects(properties) {
	return properties.reduce((result, left) => {
		return [...result, _Object_(left)];
	}, []);
}
function MappedOperation(context, state, identifier, type, as, property) {
	return EvaluateIntersect(MappedObjects(MappedProperties(context, state, identifier, MappedVariants(type), as, property)));
}
//#endregion
//#region node_modules/typebox/build/type/engine/mapped/instantiate.mjs
function MappedAction(context, state, identifier, type, as, property, options) {
	return CanInstantiate([type]) ? Update(MappedOperation(context, state, identifier, type, as, property), {}, options) : MappedDeferred(identifier, type, as, property, options);
}
function MappedInstantiate(context, state, identifier, type, as, property, options) {
	return MappedAction(context, state, identifier, InstantiateType(context, state, type), as, property, options);
}
//#endregion
//#region node_modules/typebox/build/type/engine/module/instantiate.mjs
function InstantiateCyclics(context, cyclicKeys) {
	return Keys(context).filter((key) => cyclicKeys.includes(key)).reduce((result, key) => {
		return {
			...result,
			[key]: InstantiateCyclic(context, key, context[key])
		};
	}, {});
}
function InstantiateNonCyclics(context, cyclicKeys) {
	return Keys(context).filter((key) => !cyclicKeys.includes(key)).reduce((result, key) => {
		return {
			...result,
			[key]: InstantiateType(context, { callstack: [] }, context[key])
		};
	}, {});
}
function InstantiateModule(context, options) {
	const cyclicCandidates = CyclicCandidates(context);
	const instantiatedCyclics = InstantiateCyclics(context, cyclicCandidates);
	const instantiatedNonCyclics = InstantiateNonCyclics(context, cyclicCandidates);
	return Update({
		...instantiatedCyclics,
		...instantiatedNonCyclics
	}, {}, options);
}
function ModuleInstantiate(context, _state, properties, options) {
	return InstantiateModule(Assign(context, properties), options);
}
//#endregion
//#region node_modules/typebox/build/type/action/non_nullable.mjs
/** Creates a deferred NonNullable action. */
function NonNullableDeferred(type, options = {}) {
	return Deferred("NonNullable", [type], options);
}
//#endregion
//#region node_modules/typebox/build/type/engine/non_nullable/instantiate.mjs
function NonNullableOperation(type) {
	return ExcludeAction(type, Union([Null(), Undefined()]), {});
}
function NonNullableAction(type, options) {
	return CanInstantiate([type]) ? Update(NonNullableOperation(type), {}, options) : NonNullableDeferred(type, options);
}
function NonNullableInstantiate(context, state, type, options) {
	return NonNullableAction(InstantiateType(context, state, type), options);
}
//#endregion
//#region node_modules/typebox/build/type/action/omit.mjs
/** Creates a deferred Omit action. */
function OmitDeferred(type, indexer, options = {}) {
	return Deferred("Omit", [type, indexer], options);
}
//#endregion
//#region node_modules/typebox/build/type/engine/indexable/to_indexable.mjs
/** Transforms a type into a TProperties used for indexing operations */
function ToIndexable(type) {
	const collapsed = CollapseToObject(type);
	return IsObject(collapsed) ? collapsed.properties : Unreachable();
}
//#endregion
//#region node_modules/typebox/build/type/engine/omit/from_type.mjs
function FromKeys$1(properties, keys) {
	return Keys(properties).reduce((result, key) => {
		return keys.includes(key) ? result : {
			...result,
			[key]: properties[key]
		};
	}, {});
}
function FromType$4(type, indexer) {
	return _Object_(FromKeys$1(ToIndexable(type), ToIndexableKeys(indexer)));
}
//#endregion
//#region node_modules/typebox/build/type/engine/omit/instantiate.mjs
function OmitAction(type, indexer, options) {
	return CanInstantiate([type, indexer]) ? Update(FromType$4(type, indexer), {}, options) : OmitDeferred(type, indexer, options);
}
function OmitInstantiate(context, state, type, indexer, options) {
	return OmitAction(InstantiateType(context, state, type), InstantiateType(context, state, indexer), options);
}
//#endregion
//#region node_modules/typebox/build/type/action/options.mjs
/** Creates a deferred Options action. */
function OptionsDeferred(type, options) {
	return Deferred("Options", [type, options], {});
}
/** Applies an immediate Options action to the given type. */
function Options(type, options) {
	return OptionsAction(type, options);
}
//#endregion
//#region node_modules/typebox/build/type/engine/options/instantiate.mjs
function OptionsAction(type, options) {
	return CanInstantiate([type]) ? Update(type, {}, options) : OptionsDeferred(type, options);
}
function OptionsInstantiate(context, state, type, options) {
	return OptionsAction(InstantiateType(context, state, type), options);
}
//#endregion
//#region node_modules/typebox/build/type/action/parameters.mjs
/** Creates a deferred Parameters action. */
function ParametersDeferred(type, options = {}) {
	return Deferred("Parameters", [type], options);
}
//#endregion
//#region node_modules/typebox/build/type/engine/parameters/instantiate.mjs
function ParametersOperation(type) {
	return Tuple(InstantiateElements({}, { callstack: [] }, IsFunction(type) ? type["parameters"] : []));
}
function ParametersAction(type, options) {
	return CanInstantiate([type]) ? Update(ParametersOperation(type), {}, options) : ParametersDeferred(type, options);
}
function ParametersInstantiate(context, state, type, options) {
	return ParametersAction(InstantiateType(context, state, type), options);
}
//#endregion
//#region node_modules/typebox/build/type/action/partial.mjs
/** Creates a deferred Partial action. */
function PartialDeferred(type, options = {}) {
	return Deferred("Partial", [type], options);
}
//#endregion
//#region node_modules/typebox/build/type/engine/partial/from_cyclic.mjs
function FromCyclic$2(defs, ref) {
	const partial = FromType$3(CyclicTarget(defs, ref));
	return Cyclic(Assign(defs, { [ref]: partial }), ref);
}
//#endregion
//#region node_modules/typebox/build/type/engine/partial/from_intersect.mjs
function FromIntersect$2(types) {
	return EvaluateIntersect(types.map((type) => FromType$3(type)));
}
//#endregion
//#region node_modules/typebox/build/type/engine/partial/from_union.mjs
function FromUnion$2(types) {
	return Union(types.map((type) => FromType$3(type)));
}
//#endregion
//#region node_modules/typebox/build/type/engine/partial/from_object.mjs
function FromObject$2(properties) {
	return _Object_(Keys(properties).reduce((result, left) => {
		return {
			...result,
			[left]: Optional(properties[left])
		};
	}, {}));
}
//#endregion
//#region node_modules/typebox/build/type/engine/partial/from_type.mjs
function FromType$3(type) {
	return IsCyclic(type) ? FromCyclic$2(type.$defs, type.$ref) : IsIntersect(type) ? FromIntersect$2(type.allOf) : IsUnion(type) ? FromUnion$2(type.anyOf) : IsObject(type) ? FromObject$2(type.properties) : _Object_({});
}
//#endregion
//#region node_modules/typebox/build/type/engine/partial/instantiate.mjs
function PartialAction(type, options) {
	return CanInstantiate([type]) ? Update(FromType$3(type), {}, options) : PartialDeferred(type, options);
}
function PartialInstantiate(context, state, type, options) {
	return PartialAction(InstantiateType(context, state, type), options);
}
//#endregion
//#region node_modules/typebox/build/type/action/pick.mjs
/** Creates a deferred Pick action. */
function PickDeferred(type, indexer, options = {}) {
	return Deferred("Pick", [type, indexer], options);
}
//#endregion
//#region node_modules/typebox/build/type/engine/pick/from_type.mjs
function FromKeys(properties, keys) {
	return Keys(properties).reduce((result, key) => {
		return keys.includes(key) ? Assign(result, { [key]: properties[key] }) : result;
	}, {});
}
function FromType$2(type, indexer) {
	return _Object_(FromKeys(ToIndexable(type), ToIndexableKeys(indexer)));
}
//#endregion
//#region node_modules/typebox/build/type/engine/pick/instantiate.mjs
function PickAction(type, indexer, options) {
	return CanInstantiate([type, indexer]) ? Update(FromType$2(type, indexer), {}, options) : PickDeferred(type, indexer, options);
}
function PickInstantiate(context, state, type, indexer, options) {
	return PickAction(InstantiateType(context, state, type), InstantiateType(context, state, indexer), options);
}
//#endregion
//#region node_modules/typebox/build/type/action/readonly_object.mjs
/** Creates a deferred ReadonlyType action. */
function ReadonlyObjectDeferred(type, options = {}) {
	return Deferred("ReadonlyObject", [type], options);
}
//#endregion
//#region node_modules/typebox/build/type/engine/readonly_object/from_array.mjs
function FromArray(type) {
	return Immutable(_Array_(type));
}
//#endregion
//#region node_modules/typebox/build/type/engine/readonly_object/from_cyclic.mjs
function FromCyclic$1(defs, ref) {
	const partial = FromType$1(CyclicTarget(defs, ref));
	return Cyclic(Assign(defs, { [ref]: partial }), ref);
}
//#endregion
//#region node_modules/typebox/build/type/engine/readonly_object/from_intersect.mjs
function FromIntersect$1(types) {
	return EvaluateIntersect(types.map((type) => FromType$1(type)));
}
//#endregion
//#region node_modules/typebox/build/type/engine/readonly_object/from_object.mjs
function FromObject$1(properties) {
	return _Object_(Keys(properties).reduce((result, left) => {
		return {
			...result,
			[left]: Readonly(properties[left])
		};
	}, {}));
}
//#endregion
//#region node_modules/typebox/build/type/engine/readonly_object/from_tuple.mjs
function FromTuple(types) {
	return Immutable(Tuple(types));
}
//#endregion
//#region node_modules/typebox/build/type/engine/readonly_object/from_union.mjs
function FromUnion$1(types) {
	return Union(types.map((type) => FromType$1(type)));
}
//#endregion
//#region node_modules/typebox/build/type/engine/readonly_object/from_type.mjs
function FromType$1(type) {
	return IsArray(type) ? FromArray(type.items) : IsCyclic(type) ? FromCyclic$1(type.$defs, type.$ref) : IsIntersect(type) ? FromIntersect$1(type.allOf) : IsObject(type) ? FromObject$1(type.properties) : IsTuple(type) ? FromTuple(type.items) : IsUnion(type) ? FromUnion$1(type.anyOf) : type;
}
//#endregion
//#region node_modules/typebox/build/type/engine/readonly_object/instantiate.mjs
function ReadonlyObjectAction(type, options) {
	return CanInstantiate([type]) ? Update(FromType$1(type), {}, options) : ReadonlyObjectDeferred(type);
}
function ReadonlyObjectInstantiate(context, state, type, options) {
	return ReadonlyObjectAction(InstantiateType(context, state, type), options);
}
//#endregion
//#region node_modules/typebox/build/type/engine/ref/instantiate.mjs
function RefInstantiate(context, state, type, ref) {
	return ref in context ? CyclicCheck([ref], context, context[ref]) ? type : InstantiateType(context, state, context[ref]) : type;
}
//#endregion
//#region node_modules/typebox/build/type/engine/required/from_cyclic.mjs
function FromCyclic(defs, ref) {
	const partial = FromType(CyclicTarget(defs, ref));
	return Cyclic(Assign(defs, { [ref]: partial }), ref);
}
//#endregion
//#region node_modules/typebox/build/type/engine/required/from_intersect.mjs
function FromIntersect(types) {
	return EvaluateIntersect(types.map((type) => FromType(type)));
}
//#endregion
//#region node_modules/typebox/build/type/engine/required/from_union.mjs
function FromUnion(types) {
	return Union(types.map((type) => FromType(type)));
}
//#endregion
//#region node_modules/typebox/build/type/engine/required/from_object.mjs
function FromObject(properties) {
	return _Object_(Keys(properties).reduce((result, left) => {
		return {
			...result,
			[left]: OptionalRemove(properties[left])
		};
	}, {}));
}
//#endregion
//#region node_modules/typebox/build/type/engine/required/from_type.mjs
function FromType(type) {
	return IsCyclic(type) ? FromCyclic(type.$defs, type.$ref) : IsIntersect(type) ? FromIntersect(type.allOf) : IsUnion(type) ? FromUnion(type.anyOf) : IsObject(type) ? FromObject(type.properties) : _Object_({});
}
//#endregion
//#region node_modules/typebox/build/type/action/required.mjs
/** Creates a deferred Required action. */
function RequiredDeferred(type, options = {}) {
	return Deferred("Required", [type], options);
}
//#endregion
//#region node_modules/typebox/build/type/engine/required/instantiate.mjs
function RequiredAction(type, options) {
	return CanInstantiate([type]) ? Update(FromType(type), {}, options) : RequiredDeferred(type, options);
}
function RequiredInstantiate(context, state, type, options) {
	return RequiredAction(InstantiateType(context, state, type), options);
}
//#endregion
//#region node_modules/typebox/build/type/action/return_type.mjs
/** Creates a deferred ReturnType action. */
function ReturnTypeDeferred(type, options = {}) {
	return Deferred("ReturnType", [type], options);
}
//#endregion
//#region node_modules/typebox/build/type/engine/return_type/instantiate.mjs
function ReturnTypeOperation(type) {
	return IsFunction(type) ? type["returnType"] : Never();
}
function ReturnTypeAction(type, options) {
	return CanInstantiate([type]) ? Update(ReturnTypeOperation(type), {}, options) : ReturnTypeDeferred(type, options);
}
function ReturnTypeInstantiate(context, state, type, options = {}) {
	return ReturnTypeAction(InstantiateType(context, state, type), options);
}
//#endregion
//#region node_modules/typebox/build/type/engine/rest/spread.mjs
function SpreadElement(type) {
	return IsRest(type) ? IsTuple(type.items) ? RestSpread(type.items.items) : IsInfer(type.items) ? [type] : IsRef(type.items) ? [type] : [Never()] : [type];
}
function RestSpread(types) {
	return types.reduce((result, left) => {
		return [...result, ...SpreadElement(left)];
	}, []);
}
//#endregion
//#region node_modules/typebox/build/type/engine/instantiate.mjs
function CanInstantiate(types) {
	return TakeLeft(types, (left, right) => IsRef(left) ? false : CanInstantiate(right), () => true);
}
function ModifierActions(type, readonly, optional) {
	return IsReadonlyRemoveAction(type) ? ModifierActions(type.type, "remove", optional) : IsOptionalRemoveAction(type) ? ModifierActions(type.type, readonly, "remove") : IsReadonlyAddAction(type) ? ModifierActions(type.type, "add", optional) : IsOptionalAddAction(type) ? ModifierActions(type.type, readonly, "add") : [
		type,
		readonly,
		optional
	];
}
function ApplyReadonly(action, type) {
	return IsEqual(action, "remove") ? ReadonlyRemove(type) : IsEqual(action, "add") ? ReadonlyAdd(type) : type;
}
function ApplyOptional(action, type) {
	return IsEqual(action, "remove") ? OptionalRemove(type) : IsEqual(action, "add") ? OptionalAdd(type) : type;
}
function InstantiateProperties(context, state, properties) {
	return Keys(properties).reduce((result, key) => {
		return {
			...result,
			[key]: InstantiateType(context, state, properties[key])
		};
	}, {});
}
function InstantiateElements(context, state, types) {
	return RestSpread(InstantiateTypes(context, state, types));
}
function InstantiateTypes(context, state, types) {
	return types.map((type) => InstantiateType(context, state, type));
}
function InstantiateDeferred(context, state, action, parameters, options) {
	return IsEqual(action, "Awaited") ? AwaitedInstantiate(context, state, parameters[0], options) : IsEqual(action, "Capitalize") ? CapitalizeInstantiate(context, state, parameters[0], options) : IsEqual(action, "Conditional") ? ConditionalInstantiate(context, state, parameters[0], parameters[1], parameters[2], parameters[3], options) : IsEqual(action, "ConstructorParameters") ? ConstructorParametersInstantiate(context, state, parameters[0], options) : IsEqual(action, "Evaluate") ? EvaluateInstantiate(context, state, parameters[0], options) : IsEqual(action, "Exclude") ? ExcludeInstantiate(context, state, parameters[0], parameters[1], options) : IsEqual(action, "Extract") ? ExtractInstantiate(context, state, parameters[0], parameters[1], options) : IsEqual(action, "Index") ? IndexInstantiate(context, state, parameters[0], parameters[1], options) : IsEqual(action, "InstanceType") ? InstanceTypeInstantiate(context, state, parameters[0], options) : IsEqual(action, "Interface") ? InterfaceInstantiate(context, state, parameters[0], parameters[1], options) : IsEqual(action, "KeyOf") ? KeyOfInstantiate(context, state, parameters[0], options) : IsEqual(action, "Lowercase") ? LowercaseInstantiate(context, state, parameters[0], options) : IsEqual(action, "Mapped") ? MappedInstantiate(context, state, parameters[0], parameters[1], parameters[2], parameters[3], options) : IsEqual(action, "Module") ? ModuleInstantiate(context, state, parameters[0], options) : IsEqual(action, "NonNullable") ? NonNullableInstantiate(context, state, parameters[0], options) : IsEqual(action, "Pick") ? PickInstantiate(context, state, parameters[0], parameters[1], options) : IsEqual(action, "Options") ? OptionsInstantiate(context, state, parameters[0], parameters[1]) : IsEqual(action, "Parameters") ? ParametersInstantiate(context, state, parameters[0], options) : IsEqual(action, "Partial") ? PartialInstantiate(context, state, parameters[0], options) : IsEqual(action, "Omit") ? OmitInstantiate(context, state, parameters[0], parameters[1], options) : IsEqual(action, "ReadonlyObject") ? ReadonlyObjectInstantiate(context, state, parameters[0], options) : IsEqual(action, "Record") ? RecordInstantiate(context, state, parameters[0], parameters[1], options) : IsEqual(action, "Required") ? RequiredInstantiate(context, state, parameters[0], options) : IsEqual(action, "ReturnType") ? ReturnTypeInstantiate(context, state, parameters[0], options) : IsEqual(action, "TemplateLiteral") ? TemplateLiteralInstantiate(context, state, parameters[0], options) : IsEqual(action, "Uncapitalize") ? UncapitalizeInstantiate(context, state, parameters[0], options) : IsEqual(action, "Uppercase") ? UppercaseInstantiate(context, state, parameters[0], options) : Deferred(action, parameters, options);
}
function InstantiateType(context, state, input) {
	const immutable = IsImmutable(input);
	const modifiers = ModifierActions(input, IsReadonly(input) ? "add" : "none", IsOptional(input) ? "add" : "none");
	const type = IsBase(modifiers[0]) ? modifiers[0].Clone() : modifiers[0];
	const instantiated = IsRef(type) ? RefInstantiate(context, state, type, type.$ref) : IsArray(type) ? _Array_(InstantiateType(context, state, type.items), ArrayOptions(type)) : IsAsyncIterator(type) ? AsyncIterator(InstantiateType(context, state, type.iteratorItems), AsyncIteratorOptions(type)) : IsCall(type) ? CallInstantiate(context, state, type.target, type.arguments) : IsConstructor(type) ? Constructor(InstantiateTypes(context, state, type.parameters), InstantiateType(context, state, type.instanceType), ConstructorOptions(type)) : IsDeferred(type) ? InstantiateDeferred(context, state, type.action, type.parameters, type.options) : IsFunction(type) ? _Function_(InstantiateTypes(context, state, type.parameters), InstantiateType(context, state, type.returnType), FunctionOptions(type)) : IsIntersect(type) ? Intersect(InstantiateTypes(context, state, type.allOf), IntersectOptions(type)) : IsIterator(type) ? Iterator(InstantiateType(context, state, type.iteratorItems), IteratorOptions(type)) : IsObject(type) ? _Object_(InstantiateProperties(context, state, type.properties), ObjectOptions(type)) : IsPromise(type) ? _Promise_(InstantiateType(context, state, type.item), PromiseOptions(type)) : IsRecord(type) ? RecordFromPattern(RecordPattern(type), InstantiateType(context, state, RecordValue(type))) : IsRest(type) ? Rest(InstantiateType(context, state, type.items)) : IsTuple(type) ? Tuple(InstantiateElements(context, state, type.items), TupleOptions(type)) : IsUnion(type) ? Union(InstantiateTypes(context, state, type.anyOf), UnionOptions(type)) : type;
	const withImmutable = immutable ? Immutable(instantiated) : instantiated;
	return ApplyReadonly(modifiers[1], ApplyOptional(modifiers[2], withImmutable));
}
/** Instantiates computed schematics using the given context and type. */
function Instantiate(context, type) {
	return InstantiateType(context, { callstack: [] }, type);
}
//#endregion
//#region node_modules/typebox/build/type/engine/awaited/instantiate.mjs
function AwaitedOperation(type) {
	return IsPromise(type) ? AwaitedOperation(type.item) : type;
}
function AwaitedAction(type, options) {
	return CanInstantiate([type]) ? Update(AwaitedOperation(type), {}, options) : AwaitedDeferred(type, options);
}
function AwaitedInstantiate(context, state, type, options) {
	return AwaitedAction(InstantiateType(context, state, type), options);
}
//#endregion
//#region node_modules/typebox/build/type/action/awaited.mjs
/** Creates a deferred Awaited action. */
function AwaitedDeferred(type, options = {}) {
	return Deferred("Awaited", [type], options);
}
//#endregion
//#region node_modules/typebox/build/type/action/evaluate.mjs
/** Applies an Evaluate action to a type. */
function Evaluate(type, options = {}) {
	return EvaluateAction(type, options);
}
//#endregion
export { IsMap as $, IsBigInt as A, IsSymbol$1 as At, Union as B, IsLiteralNumber as C, IsMinLength as Ct, IsInteger as D, IsObject$1 as Dt, Integer as E, IsNumber$2 as Et, IsEnum as F, Symbols as Ft, Ref as G, _Object_ as H, Unsafe as I, IsBase as J, IsArray as K, IsCyclic as L, Hash as M, IsUnsafePropertyKey as Mt, Unreachable as N, IsValueLike as Nt, Boolean$1 as O, IsObjectNotArray as Ot, IsIntersect as P, Keys as Pt, Get as Q, Unknown as R, IsLiteralBoolean as S, IsMaxLength as St, Literal as T, IsNull$1 as Tt, Any as U, IsObject as V, IsRef as W, Optional as X, IsOptional as Y, IsSchema as Z, IsNumber as _, IsGreaterThan as _t, IsTemplateLiteral as a, EveryAll as at, IsLiteral as b, IsLessEqualThan as bt, IsRecord as c, IsAsyncIterator$1 as ct, RecordValue as d, IsClassInstance as dt, IsSet as et, IsTuple as f, IsConstructor$1 as ft, String$1 as g, IsGreaterEqualThan as gt, IsString as h, IsFunction$1 as ht, Compare as i, Every as it, IsCodec as j, IsUndefined$1 as jt, IsBoolean as k, IsString$2 as kt, Record as l, IsBigInt$1 as lt, TemplateLiteralDecode as m, IsEqual as mt, Instantiate as n, Entries as nt, IsVoid as o, HasPropertyKey as ot, EnumToUnion as p, IsDeepEqual as pt, _Array_ as q, Options as r, EntriesRegExp as rt, IsUndefined as s, IsArray$1 as st, Evaluate as t, IsTypeArray as tt, RecordPattern as u, IsBoolean$2 as ut, Number$1 as v, IsInteger$1 as vt, IsLiteralString as w, IsMultipleOf as wt, IsLiteralBigInt as x, IsLessThan as xt, IsNull as y, IsIterator$1 as yt, IsUnion as z };
