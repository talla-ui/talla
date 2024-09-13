import { ManagedEvent, ManagedObject } from "../../../dist/index.js";
import { describe, expect, test } from "@talla-ui/test-handler";

describe("ManagedObject", () => {
	test("Constructor", () => {
		class C extends ManagedObject {}
		let c = new C();
		expect(c).toBeInstanceOf(ManagedObject);
		expect(c.isUnlinked()).not.toBeTruthy();
	});

	test("Basic unlinking", () => {
		class C extends ManagedObject {}
		let c = new C();
		expect(() => c.unlink()).not.toThrowError();
		expect(c.isUnlinked()).toBeTruthy();

		// unlink again, should be fine
		expect(() => c.unlink()).not.toThrowError();
		expect(c.isUnlinked()).toBeTruthy();
	});

	test("Unlinking invokes beforeUnlink method", (t) => {
		class C extends ManagedObject {
			override beforeUnlink() {
				t.count("unlink");
			}
		}
		let c = new C();
		c.unlink();
		c.unlink(); // not called again
		t.expectCount("unlink").toBe(1);
	});

	describe("Observe properties", () => {
		test("Observe single property", (t) => {
			class MyObject extends ManagedObject {
				foo = "foo";
			}
			let c = new MyObject();
			let values: any[] = [];
			ManagedObject.observe(c, ["foo"], (object, p, value) => {
				expect(object).toBe(c);
				expect(p).toBe("foo");
				values.push(value);
			});
			c.foo = "bar";
			c.foo = "bar";
			c.foo = "baz";
			expect(values).toBeArray(["bar", "baz"]);
		});

		test("Cannot observe unlinked object", () => {
			let c = new ManagedObject();
			c.unlink();
			expect(() =>
				ManagedObject.observe(c, ["foo"] as any, () => {}),
			).toThrowError();
		});
	});

	describe("Basic attached managed objects", () => {
		let id = 0;

		class AnotherObject extends ManagedObject {
			id = id++;
		}
		class ChildObject extends ManagedObject {
			id = id++;
			readonly another = this.attach(new AnotherObject());
		}
		class TestObject extends ManagedObject {
			constructor(child: ChildObject = new ChildObject()) {
				super();
				this.child = this.attach(child);
			}
			id = id++;
			child: ChildObject;
		}

		function setup() {
			let parent = new TestObject();
			return { parent, child: parent.child!, another: parent.child!.another! };
		}

		test("Basic structure", () => {
			let { parent, child, another } = setup();
			expect(parent).toBeInstanceOf(TestObject);
			expect(child).toBeInstanceOf(ChildObject);
			expect(another).toBeInstanceOf(AnotherObject);
		});

		test("Find parent", () => {
			let { parent, child, another } = setup();
			expect(ManagedObject.whence(another)).toBe(child);
			expect(ManagedObject.whence(child)).toBe(parent);
			expect(ManagedObject.whence(parent)).toBeUndefined();
			expect(ManagedObject.whence()).toBeUndefined();
		});

		test("Find parent of type", () => {
			let { parent, child, another } = setup();
			expect(TestObject.whence(another)).toBe(parent);
			expect(ChildObject.whence(another)).toBe(child);
			expect(ChildObject.whence(child)).toBeUndefined();
		});

		test("Unlink children", () => {
			let { child, another } = setup();
			child.unlink();
			expect(another.isUnlinked()).toBeTruthy();
			expect(child.isUnlinked()).toBeTruthy();
		});

		test("Move child to new parent", () => {
			let { parent, child, another } = setup();
			expect(TestObject.whence(another)).toBe(parent);
			let newParent = new TestObject(child);
			expect(child.isUnlinked()).toBeFalsy();
			expect(another.isUnlinked()).toBeFalsy();
			expect(TestObject.whence(another)).toBe(newParent);
		});

		test("Event handler on attach", (t) => {
			class TestObject extends ManagedObject {
				constructor() {
					super();
					this.child = this.attach(new ChildObject(), (e) => {
						t.count(e.name);
					});
				}
				child: ChildObject;
			}
			let parent = new TestObject();
			parent.child.emit("Foo");
			parent.child.emit("Foo");
			parent.child.unlink();
			t.expectCount("Foo").toBe(2);
		});

		test("Event handler on attach, use callback object", (t) => {
			class TestObject extends ManagedObject {
				constructor() {
					super();
					this.child = this.attach(new ChildObject(), {
						handler: (object, e) => {
							if (object !== this.child) t.fail("Not the same object");
							t.count(e.name);
						},
					});
				}
				child: ChildObject;
			}
			let parent = new TestObject();
			parent.child.emit("Foo");
			parent.child.emit("Foo");
			parent.child.unlink();
			t.expectCount("Foo").toBe(2);
		});

		test("Event delegate on attach", (t) => {
			class TestObject extends ManagedObject {
				constructor() {
					super();
					this.child = this.attach(new ChildObject(), { delegate: this });
				}
				delegate(e: ManagedEvent) {
					if (e.source !== this.child) t.fail("Not the same object");
					t.count(e.name);
				}
				child: ChildObject;
			}
			let parent = new TestObject();
			parent.child.emit("Foo");
			parent.listen((e) => {
				t.count("Foo");
				if (e.delegate !== parent) t.fail("Invalid delegate");
			});
			parent.child.emit("Foo");
			parent.child.unlink();
			t.expectCount("Foo").toBe(3);
		});

		test("Async event delegate, expect to catch error", async (t) => {
			let p = t.sleep(1);
			class TestObject extends ManagedObject {
				constructor() {
					super();
					this.child = this.attach(new ChildObject(), { delegate: this });
				}
				async delegate(e: ManagedEvent) {
					await p;
					throw Error("Expected error");
				}
				child: ChildObject;
			}
			let parent = new TestObject();
			let error = await t.tryRunAsync(async () => {
				parent.child.emit("Foo");
				await p; // be sure to wait until after event is handled
				await p;
			});
			expect(error)
				.asString()
				.toMatchRegExp(/Expected/);
		});

		test("Detach handler on attach, then unlink", (t) => {
			class TestObject extends ManagedObject {
				constructor() {
					super();
					this.child = this.attach(new ChildObject(), {
						detached: (object) => {
							if (object !== this.child) t.fail("Not the same object");
							t.count("detached");
						},
					});
				}
				child: ChildObject;
			}
			let parent = new TestObject();
			parent.child.unlink();
			t.expectCount("detached").toBe(1);
		});

		test("Detach handler on attach, then move", (t) => {
			class TestObject extends ManagedObject {
				constructor(child: ChildObject = new ChildObject()) {
					super();
					this.child = this.attach(child, {
						handler: (_, e) => {
							t.count(e.name);
						},
						detached: (object) => {
							if (object !== this.child) t.fail("Not the same object");
							t.count("detached");
						},
					});
				}
				child: ChildObject;
			}
			let parent = new TestObject();
			parent.child.emit("Foo"); // handled by parent
			new TestObject(parent.child);
			parent.child.emit("Foo"); // handled by parent2
			t.expectCount("detached").toBe(1);
			t.expectCount("Foo").toBe(2);
		});

		test("Enforce strict hierarchy without loops", () => {
			class MyLoop extends ManagedObject {
				loop?: MyLoop;
				attachSelf() {
					this.attach(this);
				}
				attachLoop(loop = new MyLoop()) {
					return (this.loop = this.attach(loop));
				}
			}
			let parent = new MyLoop();
			let loop = parent.attachLoop();
			let loop2 = loop.attachLoop();
			expect(() => loop2.attachLoop(parent)).toThrowError();
			expect(() => parent.attachSelf()).toThrowError();
		});

		test("Cannot attach root object", () => {
			let root = new ManagedObject();
			ManagedObject.makeRoot(root);
			let parent = new ManagedObject();
			expect(() => (parent as any).attach(root)).toThrowError();
		});

		test("Cannot root attached object", () => {
			let root = new ManagedObject();
			let parent = new ManagedObject();
			(parent as any).attach(root);
			expect(() => ManagedObject.makeRoot(root)).toThrowError();
		});
	});
});
