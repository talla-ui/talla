import { StringConvertible } from "./LazyString";

/** Checks if the provided value is an object (not an array or null) */
function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Max recursion level to stop runaway validations */
const MAX_RECURSE = 100;

/** Default error StrinConvertible that gets used if none else available */
const DEFAULT_ERROR = "ObjectReader error";

/**
 * A class that can be used for validating and parsing object structures
 *
 * @description
 * The `ObjectReader` class provides a way to validate and parse object structures. Each instance is set up with a schema for an expected data structure. The resulting `ObjectReader` can be used to validate entire objects, individual fields, or JSON strings.
 *
 * @example
 * // Define a schema for a user object
 * let userReader = new ObjectReader({
 *   name: {
 *     string: {
 *       min: { length: 2, err: "Name must be at least 2 letters" }
 *     }
 *   },
 *   age: {
 *     number: {
 *       integer: true,
 *       min: { value: 18, err: "You must be at least 18 years old" }
 *     }
 *   },
 *   hobbies: {
 *     optional: true,
 *     array: { items: { string: {} } }
 *   }
 *   // ...
 * });
 *
 * // Sample input data
 * let sampleUser = {
 *   name: "Alice",
 *   age: 30,
 *   // ...
 * };
 *
 * // Validate and parse the input
 * let [user, errors] = userReader.read(sampleUser);
 * if (!user) {
 *   // ... (something went wrong, see errors)
 * }
 */
export class ObjectReader<TSchema extends ObjectReader.Schema> {
	/**
	 * Creates a new `ObjectReader` to validate and parse the specified fields
	 * @param schema A set of validation rules for all expected object fields, see {@link ObjectReader.Schema}
	 */
	constructor(schema?: TSchema) {
		this.schema = schema || ({} as any);
	}

	/**
	 * A set of validation rules for all expected object fields
	 * - This object may be updated before parsing objects or fields, although it's recommended to pass the entire schema to the {@link ObjectReader} constructor.
	 */
	readonly schema: TSchema;

	/**
	 * Parses and validates the specified object
	 * @param object The object to validate
	 * @returns A tuple that consists of the parsed (and validated) object, if it was indeed correctly parsed, and an object that contains an error for each field that was incorrectly parsed.
	 */
	read(
		object: Partial<Record<keyof TSchema, unknown>>,
	): ObjectReader.Result<TSchema> {
		if (!isObject(object)) return [undefined, { _: TypeError() }];
		let v = _validateObject(object, this.schema, MAX_RECURSE);
		return [v.value, v.errors];
	}

	/**
	 * Parses and validates a particular field of the specified object
	 * @param object The object to validate
	 * @param field The name of the field to validate
	 * @returns A tuple that consists of the parsed (and validated) field value, if it was indeed correctly parsed, and an an error (note that only one of these values is defined).
	 */
	readField<K extends keyof TSchema & string>(
		object: Record<string, unknown>,
		field: K,
	): [ObjectReader.FieldType<TSchema[K]> | undefined, Error | undefined] {
		if (!isObject(object)) return [undefined, TypeError()];
		let v = _validate(object[field], field, this.schema[field], MAX_RECURSE);
		if (v.error) return [undefined, Error(String(v.error))];
		return [v.value, undefined];
	}

	/**
	 * Parses and validates the object that's encoded in the specified JSON string
	 * - If an error occurs while parsing the JSON string, the error is stored in the `_` property of the resulting errors object.
	 * @param json The JSON string to validate
	 * @returns A tuple that consists of the parsed (and validated) object, if it was indeed correctly parsed, and an object that contains an error for each field that was incorrectly parsed.
	 */
	readJSONString(json: string): ObjectReader.Result<TSchema> {
		try {
			return this.read(JSON.parse(json));
		} catch (err) {
			return [, { _: err instanceof Error ? err : Error(String(err)) }];
		}
	}
}

export namespace ObjectReader {
	/** A rule definition for a particular field, to validate its type and value */
	export type SchemaRule = { optional?: boolean } & (
		| { validate: FieldValidator<any> }
		| {
				array: {
					items?: SchemaRule;
					err?: StringConvertible;
					min?: { length: number; err?: StringConvertible };
					max?: { length: number; err?: StringConvertible };
				};
		  }
		| { object: { schema: Schema; err?: StringConvertible } }
		| { record: { values?: SchemaRule; err?: StringConvertible } }
		| {
				boolean?: { true?: boolean; err?: StringConvertible };
				string?: {
					err?: StringConvertible;
					match?: RegExp;
					required?: true | { err?: StringConvertible };
					min?: { length: number; err?: StringConvertible };
					max?: { length: number; err?: StringConvertible };
				};
				number?: {
					err?: StringConvertible;
					integer?: true | { err?: StringConvertible };
					positive?: true | { err?: StringConvertible };
					nonzero?: true | { err?: StringConvertible };
					min?: { value: number; err?: StringConvertible };
					max?: { value: number; err?: StringConvertible };
				};
				date?: {
					err?: StringConvertible;
					min?: { date: Date; err?: StringConvertible };
					max?: { date: Date; err?: StringConvertible };
				};
				value?: { match: any[]; err?: StringConvertible };
		  }
	);

	/** A collection of schema rules to validate the expected fields of an object with matching rules */
	export type Schema = { [k: string]: SchemaRule };

	/** The type of field value that should be returned when validated using the specified rule */
	export type FieldType<SchemaRule> = SchemaRule extends { optional: true }
		? NonUndefFieldType<SchemaRule> | undefined
		: NonUndefFieldType<SchemaRule>;

	/** The type of field value that should be returned when validated using the specified rule, if not undefined */
	export type NonUndefFieldType<SchemaRule> = unknown &
		(SchemaRule extends { array: { items: infer S } }
			? FieldType<S>[]
			: unknown) &
		(SchemaRule extends { array: {} } ? unknown[] : unknown) &
		(SchemaRule extends { object: { schema: infer S extends Schema } }
			? { [k in keyof S]: ObjectType<S>[k] }
			: unknown) &
		(SchemaRule extends { record: { values: infer S } }
			? { [key: string]: FieldType<S> | undefined }
			: unknown) &
		(SchemaRule extends { record: {} } ? { [key: string]: unknown } : unknown) &
		(SchemaRule extends { validate: FieldValidator<infer V> } ? V : unknown) &
		(SchemaRule extends { value: { match: (infer V)[] } } ? V : unknown) &
		(SchemaRule extends { boolean: {} } ? boolean : unknown) &
		(SchemaRule extends { string: {} } ? string : unknown) &
		(SchemaRule extends { number: {} } ? number : unknown) &
		(SchemaRule extends { date: {} } ? Date : unknown);

	/** The type of object that should be returned when validated using the specified schema */
	export type ObjectType<TSchema extends Schema> = {
		[k in keyof TSchema]: FieldType<TSchema[k]>;
	};

	/** The result of a validation function, specifying either a field value or an error */
	export type ValidationResult<V> =
		| { value: V; error?: undefined }
		| { value?: any; error: StringConvertible };

	/**
	 * A validation function that can be used to check a particular field value
	 * - A validation function receives both the field value and the field name (or index, in the case of array items), and may return a different value than the original field value.
	 * - Validation functions can be used as part of validation rules when set to the `validate` property.
	 */
	export type FieldValidator<V> = (
		value: unknown,
		field: string | number,
	) => ValidationResult<V>;

	/** The result of {@link ObjectReader.read()}, encapsulates a tuple with either the parsed object or a set of errors */
	export type Result<TSchema extends Schema> = [
		{ [k in keyof TSchema]: ObjectType<TSchema>[k] } | undefined,
		{ [k in keyof TSchema]?: Error },
	];
}

/** Helper function to make an error return object using a (partial) rule */
function _makeError(
	rule: true | { err?: StringConvertible },
	fallback?: { err?: StringConvertible },
) {
	return { error: (rule as any).err || fallback?.err || DEFAULT_ERROR };
}

/** Helper function to validate a single value based on a given rule (recursive) */
function _validate(
	value: unknown,
	field: string | number,
	rule: ObjectReader.SchemaRule | undefined,
	maxRecurse: number,
): ObjectReader.ValidationResult<any> {
	if (!rule) throw RangeError();
	if (maxRecurse-- < 0) return { error: DEFAULT_ERROR };

	// get optional and function validation out of the way
	if (rule.optional && value === undefined) return { value: undefined };
	if ("validate" in rule) {
		let f = rule.validate;
		if (typeof f !== "function") throw TypeError();
		return f(value, field || "_");
	}

	// check objects and arrays using functions below
	if ("object" in rule) {
		if (!isObject(value)) return _makeError(rule.object);
		return _validateObject(value, rule.object.schema || {}, maxRecurse);
	}
	if ("array" in rule) {
		let arrayRule = rule.array;
		if (!Array.isArray(value)) return _makeError(arrayRule);
		if (arrayRule.min != null && value.length < arrayRule.min.length)
			return _makeError(arrayRule.min, arrayRule);
		if (arrayRule.max != null && value.length > arrayRule.max.length)
			return _makeError(arrayRule.max, arrayRule);
		return _validateArray(value, arrayRule.items || {}, maxRecurse);
	}
	if ("record" in rule) {
		if (!isObject(value)) return _makeError(rule.record);
		let result: any = Object.create(null);
		for (let k in value) {
			let r = _validate(value[k], k, rule.record.values || {}, maxRecurse);
			if (r.error) return r;
			result[k] = r.value;
		}
		return { value: result };
	}

	// if regular value type, use rule as variable below
	let {
		value: valueRule,
		boolean: booleanRule,
		string: stringRule,
		number: numberRule,
		date: dateRule,
	} = rule;

	if (booleanRule) {
		if (typeof value !== "boolean" || (booleanRule.true && !value))
			return _makeError(booleanRule);
	}
	if (stringRule) {
		if (
			typeof value !== "string" ||
			(stringRule.match && !stringRule.match.test(value))
		) {
			return _makeError(stringRule);
		}
		if (stringRule.required && !value)
			return _makeError(stringRule.required, stringRule);
		if (stringRule.min != null && value.length < stringRule.min.length)
			return _makeError(stringRule.min, stringRule);
		if (stringRule.max != null && value.length > stringRule.max.length)
			return _makeError(stringRule.max, stringRule);
	}
	if (numberRule) {
		if (typeof value === "string") value = parseFloat(value);
		if (typeof value !== "number" || isNaN(value))
			return _makeError(numberRule);
		if (numberRule.integer && !Number.isSafeInteger(value))
			return _makeError(numberRule.integer, numberRule);
		if (numberRule.nonzero && !value)
			return _makeError(numberRule.nonzero, numberRule);
		if (numberRule.positive && value < 0)
			return _makeError(numberRule.positive, numberRule);
		if (numberRule.min != null && value < numberRule.min.value)
			return _makeError(numberRule.min, numberRule);
		if (numberRule.max != null && value > numberRule.max.value)
			return _makeError(numberRule.max, numberRule);
	}
	if (dateRule) {
		if (typeof value === "string" || typeof value === "number")
			value = new Date(value);
		if (!(value instanceof Date) || isNaN(+value)) return _makeError(dateRule);
		if (dateRule.min != null && value < dateRule.min.date)
			return _makeError(dateRule.min, dateRule);
		if (dateRule.max != null && value > dateRule.max.date)
			return _makeError(dateRule.max, dateRule);
	}

	// check specified values
	if (valueRule) {
		if (!(valueRule.match || []).includes(value)) return _makeError(valueRule);
	}

	// successfully return the (new) value
	return { value };
}

/** Helper function to validate an object with given schema, returns both a single and multiple errors */
function _validateObject(
	object: {},
	rules: ObjectReader.Schema,
	maxRecurse: number,
): ObjectReader.ValidationResult<any> & { errors: Record<string, Error> } {
	let result: any = {};
	let error: StringConvertible | undefined;
	let errors: Record<string, Error> = {};
	for (let p in rules) {
		let v = _validate((object as any)[p], p, rules[p], maxRecurse);
		if (v.error) {
			if (!error) error = v.error;
			result = undefined;
			errors[p] = Error(String(v.error));
		} else if (result) {
			result[p] = v.value;
		}
	}
	return { value: result, error, errors };
}

/** Helper function to validate an array with items that match given rule */
function _validateArray(
	array: any[],
	rule: ObjectReader.SchemaRule,
	maxRecurse: number,
): ObjectReader.ValidationResult<any> {
	let result: any[] = new Array(array.length);
	for (let i = 0; i < array.length; i++) {
		let v = _validate(array[i], i, rule, maxRecurse);
		if (v.error) return v;
		result[i] = v.value;
	}
	return { value: result };
}