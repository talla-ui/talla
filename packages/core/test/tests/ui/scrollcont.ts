import { UILabel, UIScrollContainer, ui } from "../../../dist/index.js";
import { describe, test, expect, useTestContext } from "@talla-ui/test-handler";

describe("UIScrollContainer", (scope) => {
	scope.beforeEach(() => {
		useTestContext({ renderFrequency: 5 });
	});

	test("Constructor", () => {
		let cont = new UIScrollContainer();
		cont.content.add(new UILabel("foo"));
		expect(cont.horizontalScrollEnabled).toBe(true);
		expect(cont.verticalScrollEnabled).toBe(true);
		expect(cont.content).toHaveProperty("count").toBe(1);
	});

	test("Preset with properties", () => {
		let MyContainer = ui.scroll({
			horizontalScrollEnabled: false,
			verticalScrollEnabled: true,
		});
		let cont = new MyContainer();
		expect(cont).toHaveProperty("horizontalScrollEnabled").toBeFalsy();
		expect(cont).toHaveProperty("verticalScrollEnabled").toBeTruthy();
	});

	test("Scroll target events", (t) => {
		let cont = new UIScrollContainer();
		cont.listen((e) => {
			if (e.name === "UIScrollTarget") t.count("event");
		});
		cont.scrollTo(0, 0);
		cont.scrollToTop();
		cont.scrollToBottom();
		t.expectCount("event").toBe(3);
	});

	test("Rendered as container", async (t) => {
		let cont = new UIScrollContainer();
		cont.content.add(new UILabel("foo"));
		t.render(cont);
		await t.expectOutputAsync({ type: "container" }, { text: "foo" });
	});
});
