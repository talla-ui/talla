import {
	$activity,
	$view,
	Activity,
	StringConvertible,
	UILabel,
	UITextField,
	ViewComposite,
	ViewEvent,
	app,
	ui,
} from "@talla-ui/core";
import { beforeEach, expect, test } from "vitest";
import {
	clickOutputAsync,
	enterTextOutputAsync,
	expectMessageDialogAsync,
	expectNavAsync,
	expectOutputAsync,
	renderTestView,
	useTestContext,
} from "../dist/index.js";

class CountActivity extends Activity {
	constructor() {
		super();
		this.navigationPageId = "count";
	}
	protected override createView() {
		return ui
			.cell(
				ui.textField({ value: $activity.string("count"), onInput: "SetCount" }),
				ui.button("+", { onClick: "CountUp" }),
			)
			.create();
	}
	count = 0;
	onCountUp() {
		this.count++;
	}
	onSetCount(e: ViewEvent<UITextField>) {
		this.count = +e.source.value! || 0;
	}
}

let activity: CountActivity;

beforeEach((c) => {
	// initialize test app before every test
	useTestContext({ navigationPageId: "count" });
	activity = new CountActivity();
	app.addActivity(activity);
});

test("Single view is rendered", async (t) => {
	const MyView = ViewComposite.define(
		{ title: StringConvertible.EMPTY },
		ui.label($view.bind("title")),
	);
	let myView = ui.use(MyView, { title: "TEST" }).create();
	renderTestView(myView);
	await expectOutputAsync({ text: "TEST" });
});

test("Path activates activity", async (t) => {
	await expect
		.poll(() => activity.isActive(), { interval: 5, timeout: 100 })
		.toBe(true);
});

test("Another path inactivates activity", async (t) => {
	// initial path should be set directly
	expect(app.navigation.pageId).toBe("count");

	// setting another path takes some time
	app.navigate("/another/path/here");
	await expectNavAsync({ pageId: "another", detail: "path/here" });

	// by then, the activity should be made inactive
	await expect
		.poll(() => !activity.isActive(), { interval: 5, timeout: 100 })
		.toBe(true);
});

test("Activity shows view when active", async (t) => {
	let expectCell = await expectOutputAsync({ type: "cell" });
	expectCell.containing({ value: "0" }).toBeRendered();
	expectCell.containing({ type: "button" }).toBeRendered();
});

test("Other filters are not matched", async (t) => {
	await expect(
		expectOutputAsync({
			timeout: 10,
			type: "label",
			source: new UILabel(),
			text: "Not found!",
		}),
	).rejects.toThrow(/timeout/);
});

test("Button increases count", async (t) => {
	// wait for view, then click the button twice
	(await clickOutputAsync({ type: "button" })).click();
	await expectOutputAsync({ value: "2" });
});

test("Entering text sets count property", async (t) => {
	await enterTextOutputAsync("5", { type: "textfield" });
	await expectOutputAsync({ value: "5" });
	expect(activity.count).toBe(5);
});

test("Button click sets focus", async (t) => {
	// wait for view, then click the button
	let btnElement = await clickOutputAsync({ type: "button" });
	expect(btnElement.hasFocus()).toBeTruthy();
});

test("Alert dialog can be dismissed", async (t) => {
	let p = app.showAlertDialogAsync("Foo");
	let dialog = await expectMessageDialogAsync(100, "Foo");
	await dialog.confirmAsync();
	let result = await p;
	expect(result).toBeUndefined();
});

test("Confirm dialog can be cancelled", async (t) => {
	let p = app.showConfirmDialogAsync("Foo?");
	await (await expectMessageDialogAsync(100, /^Foo/)).cancelAsync();
	let result = await p;
	expect(result).toBeFalsy();
});

test("Confirm dialog can be confirmed", async (t) => {
	let p = app.showConfirmDialogAsync((d) => {
		d.messages = ["Foo?", "Bar?"];
		d.confirmLabel = "Yes";
	});
	let dialog = await expectMessageDialogAsync(10, /Foo/, /Bar/);
	await dialog.clickAsync("Yes");
	let result = await p;
	expect(result).toBeTruthy();
});