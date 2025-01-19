import { beforeEach, describe, expect, test } from "vitest";
import { AppContext, ManagedEvent, ManagedObject } from "../../dist/index.js";

let numErrors = 0;
let pendingError: any;
beforeEach((c) => {
	numErrors = 0;
	pendingError = undefined;
	AppContext.setErrorHandler((e) => {
		numErrors++;
		pendingError ||= e;
		c.onTestFinished(() => {
			if (pendingError) throw pendingError;
		});
	});
});

test("Constructor", () => {
	let e = new ManagedEvent("Foo", new ManagedObject());
	expect(e).toHaveProperty("name", "Foo");
});

test("Change event", () => {
	let o = new ManagedObject();
	let e = new ManagedEvent("Change", o, { change: o });
	expect(e).toHaveProperty("name", "Change");
	expect(e).toHaveProperty("source", o);
	expect(e.data).toHaveProperty("change", o);
});

describe("Emitting events", () => {
	class TestObject extends ManagedObject {}

	test("Emit event", () => {
		expect(() => {
			new TestObject().emit("Testing");
		}).not.toThrowError();
	});

	test("Event listener functions", () => {
		let count = 0;
		let c = new TestObject();
		c.listen((event: any) => {
			try {
				expect(event).toBeInstanceOf(ManagedEvent);
				expect(event).toHaveProperty("name", "Testing");
				count++;
			} catch (err) {
				expect.fail(String(err));
			}
		});
		c.emit("Testing");
		c.emit("Testing");
		expect(count).toBe(2);
	});

	test("Error handling", () => {
		let count = 0;
		let c = new TestObject();
		expect(numErrors).toBe(0);
		expect(pendingError).toBeUndefined();
		c.listen(() => {
			count++;

			// deliberately throw a string to test that too
			throw "Testing errors, ignore this one";
		});
		expect(() => {
			c.emit("Testing");
			c.emit("Testing");
		}).not.toThrowError();
		expect(String(pendingError)).match(/Testing/);
		pendingError = undefined;
		expect(count).toBe(2);
	});

	test("After error handling", () => {
		expect(numErrors).toBe(0);
		expect(pendingError).toBeUndefined();
	});
});

describe("Async iterator listeners", () => {
	test("Unlink cancels iterator", async () => {
		let c = new ManagedObject();
		let iter = c.listen(true)[Symbol.asyncIterator]();
		c.unlink();
		expect(await iter.next()).toHaveProperty("done", true);
	});

	test("Unlink stops waiting iterator", async () => {
		let c = new ManagedObject();
		let events = 0;
		new Promise((r) => setTimeout(r, 10)).then(() => c.unlink());
		for await (let _ of c.listen(true)) {
			events++;
		}
		expect(events).toBe(0);
	});

	test("Iterator handles events using buffer", async () => {
		let c = new ManagedObject();
		new Promise((r) => setTimeout(r, 10)).then(() => {
			c.emit("Foo");
			c.emit("Bar");
			c.emit("Baz");
		});
		let handled: string[] = [];
		for await (let event of c.listen(true)) {
			handled.push(event.name);
			if (handled.length >= 3) break;
		}
		expect(handled).toEqual(["Foo", "Bar", "Baz"]);
	});

	test("Iterator handles events directly", async () => {
		let c = new ManagedObject();
		new Promise((r) => setTimeout(r, 10)).then(() => c.emit("Foo"));
		for await (let event of c.listen(true)) {
			if (event.name === "Foo") c.emit("Bar");
			if (event.name === "Bar") c.unlink();
		}
	});

	test("Iterator handles exceptions", async () => {
		let c = new ManagedObject();
		let errors = 0;
		new Promise((r) => setTimeout(r, 10)).then(() => c.emit("Foo"));
		try {
			for await (let _event of c.listen(true)) {
				throw Error("Testing");
			}
		} catch (err) {
			errors++;
		}
		expect(errors).toBe(1);
	});
});
