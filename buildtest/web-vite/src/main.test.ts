import { describe, test, useTestContext } from "@talla-ui/test-handler";
import { MainActivity } from "./main";

describe("Main", (scope) => {
	let activity: MainActivity;
	scope.beforeEach(() => {
		activity = new MainActivity();
		useTestContext().addActivity(activity, true);
	});

	test("Shows hello world", async (t) => {
		await t.expectOutputAsync({ type: "label", text: "Hello, world!" });
	});
});
