import { RenderContext, UISpacer } from "@talla-ui/core";
import { TestOutputElement } from "../TestOutputElement.js";
import { TestBaseObserver, applyElementStyle } from "./TestBaseObserver.js";

/** @internal */
export class UISpacerRenderer extends TestBaseObserver<UISpacer> {
	constructor(observed: UISpacer) {
		super(observed);
		this.observeProperties("width", "height", "minWidth", "minHeight");
	}

	protected override propertyChange(property: string, value: any) {
		if (!this.element) return;
		switch (property) {
			case "width":
			case "height":
			case "minWidth":
			case "minHeight":
				this.scheduleUpdate(undefined, this.element);
				return;
		}
		super.propertyChange(property, value);
	}

	getOutput() {
		let elt = new TestOutputElement("spacer");
		let output = new RenderContext.Output(this.observed, elt);
		elt.output = output;
		return output;
	}

	updateContent() {}

	override updateStyle(element: TestOutputElement) {
		let spacer = this.observed;
		let { width, height, minWidth, minHeight } = spacer;
		let hasMinimum = minWidth !== undefined || minHeight !== undefined;
		let hasFixed = width !== undefined || height !== undefined;
		applyElementStyle(element, [
			{
				width,
				height,
				minWidth,
				minHeight,
				grow: hasFixed ? 0 : 1,
				shrink: hasMinimum ? 0 : 1,
			},
			spacer.position,
		]);
	}
}
