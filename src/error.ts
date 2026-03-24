export function renderError(err: string, el: HTMLElement, extra?: HTMLSpanElement) {
    const wrapper = document.createElement("div");

    const message = document.createElement("strong");
    message.innerText = "Desmos graph error: ";
    wrapper.appendChild(message);

    const ctx = document.createElement("span");
    ctx.innerText = err;
    wrapper.appendChild(ctx);

    if (extra) {
        wrapper.appendChild(document.createElement("br"));
        const messageExtra = document.createElement("strong");
        messageExtra.innerText = "Note: ";
        wrapper.appendChild(messageExtra);
        wrapper.appendChild(extra);
    }

    const container = document.createElement("div");
    container.addClass("desmos-error");
    container.appendChild(wrapper);

    el.empty();
    el.appendChild(container);
}
