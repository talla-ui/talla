import {
	TestRenderer,
	describe,
	expect,
	test,
	useTestContext,
} from "@talla-ui/test-handler";
import {
	$view,
	Activity,
	ManagedEvent,
	StringConvertible,
	UILabel,
	UITextField,
	UIViewRenderer,
	ViewComposite,
	app,
	bind,
	ui,
} from "../../../dist/index.js";

describe("UIViewRenderer", (scope) => {
	scope.beforeEach(() => {
		useTestContext({ renderFrequency: 5 });
	});

	test("Constructor", () => {
		let viewRenderer = new UIViewRenderer();
		expect(viewRenderer).toHaveProperty("view").toBeUndefined();
	});

	test("Set simple view and render", async (t) => {
		let MyCell = ui.cell(ui.label("foo"));
		let viewRenderer = new UIViewRenderer();
		viewRenderer.view = new MyCell();
		t.render(viewRenderer);
		await t.expectOutputAsync({ text: "foo" });
		expect(viewRenderer.findViewContent(UILabel)).toBeArray(1);
	});

	test("Change view after rendering", async (t) => {
		let MyCell1 = ui.cell(ui.label("foo"));
		let MyCell2 = ui.cell(ui.label("bar"));
		let viewRenderer = new UIViewRenderer();
		viewRenderer.view = new MyCell1();
		t.render(viewRenderer);
		await t.expectOutputAsync({ text: "foo" });
		viewRenderer.view = new MyCell2();
		await t.expectOutputAsync({ text: "bar" });
	});

	test("Unlink view after rendering", async (t) => {
		let MyCell = ui.cell(ui.label("foo"));
		let viewRenderer = new UIViewRenderer();
		viewRenderer.view = new MyCell();
		t.render(viewRenderer);
		await t.expectOutputAsync({ text: "foo" });
		viewRenderer.view.unlink();
		await t.sleep(20);
		expect((app.renderer as TestRenderer).hasOutput()).toBeFalsy();
	});

	test("Set view using view composite, and render", async (t) => {
		const CompView = ViewComposite.define(
			{ text: StringConvertible.EMPTY },
			ui.label($view.string("text")),
		);
		const Preset = ui.use(CompView, { text: "foo" });
		class MyActivity extends Activity {
			protected override createView() {
				return ui.renderView({ view: bind("vc") }).create();
			}
			vc = this.attach(new Preset());
		}
		app.addActivity(new MyActivity(), true);
		await t.expectOutputAsync({ text: "foo" });
	});

	test("Set view and focus", async (t) => {
		let viewRenderer = new UIViewRenderer();
		viewRenderer.view = new UITextField();
		t.render(viewRenderer);
		await t.expectOutputAsync({ type: "textfield", focused: false });
		viewRenderer.requestFocus();
		await t.expectOutputAsync({ type: "textfield", focused: true });
	});

	test("Use activity view and render", async (t) => {
		// activity that will be rendered as nested view
		class MySecondActivity extends Activity {
			protected override createView() {
				this.renderOptions = {}; // no direct rendering
				return ui.cell(ui.button("foo", "+ButtonPress")).create();
			}
			onButtonPress() {
				t.count("foo-second");
			}
		}

		// containing activity
		class MyActivity extends Activity {
			protected override createView() {
				return ui
					.cell(
						{ accessibleLabel: "outer" },
						ui.renderView({
							view: bind("second.view"),
							propagateEvents: true,
						}),
					)
					.create();
			}
			readonly second = this.attach(new MySecondActivity());
			onButtonPress(e: ManagedEvent) {
				t.count("foo-outer");
			}
		}
		t.log("Adding activity...");
		let activity = new MyActivity();
		app.addActivity(activity, true);

		// view should only show up when `second` is activated
		t.log("Testing without `second`...");
		let out = await t.expectOutputAsync({
			type: "cell",
			accessibleLabel: "outer",
		});
		out.containing({ text: "foo" }).toBeEmpty();
		t.log("Activating `second`...");
		await activity.second!.activateAsync();
		out = await t.expectOutputAsync(
			{ accessibleLabel: "outer" },
			{ text: "foo" },
		);

		// clicking the button should propagate all events
		t.log("Clicking button...");
		out.getSingle().click();
		t.expectCount("foo-second").toBe(1);
		t.expectCount("foo-outer").toBe(1);

		// destroying the second activity should clear the view
		t.log("Destroying `second`...");
		activity.second!.unlink();
		expect(activity.second).toHaveProperty("view").toBeUndefined();
		out = await t.expectOutputAsync({
			type: "cell",
			accessibleLabel: "outer",
		});
		out.containing({ text: "foo" }).toBeEmpty();
	});
});
