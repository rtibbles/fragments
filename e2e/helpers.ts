import { browser } from "@wdio/globals";

/**
 * WebKitWebDriver doesn't support standard WebDriver click/value commands.
 * Use JavaScript execution as a workaround.
 */

type AnyElement = WebdriverIO.Element | ChainablePromiseElement;
type ChainablePromiseElement = import("webdriverio").ChainablePromiseElement;

export async function jsClick(el: AnyElement): Promise<void> {
  await browser.execute("arguments[0].click()", el as WebdriverIO.Element);
}

export async function jsSetValue(
  el: AnyElement,
  value: string,
): Promise<void> {
  await browser.execute(
    `
    var input = arguments[0];
    var val = arguments[1];
    var nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    nativeSetter.call(input, val);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    `,
    el as WebdriverIO.Element,
    value,
  );
}

export async function jsType(
  el: AnyElement,
  text: string,
): Promise<void> {
  await browser.execute(
    `
    var element = arguments[0];
    var txt = arguments[1];
    element.focus();
    element.textContent = txt;
    element.dispatchEvent(new Event('input', { bubbles: true }));
    `,
    el as WebdriverIO.Element,
    text,
  );
}
