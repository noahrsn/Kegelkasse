/**
 * Kegelkasse — Client-side JavaScript
 *
 * HTMX handles most interactivity. Alpine.js handles local UI state.
 * This file provides HTMX event hooks and small helpers.
 */

// After HTMX swaps content, trigger pop animation on newly added penalties
document.body.addEventListener("htmx:afterSwap", function (event) {
    const target = event.detail.target;
    if (target.classList.contains("penalty-list")) {
        const lastChild = target.lastElementChild;
        if (lastChild) {
            lastChild.classList.add("animate-pop");
            setTimeout(() => lastChild.classList.remove("animate-pop"), 300);
        }
    }
});

// Confirm destructive actions
document.body.addEventListener("htmx:confirm", function (event) {
    if (event.target.hasAttribute("data-confirm")) {
        const message = event.target.getAttribute("data-confirm");
        if (!confirm(message)) {
            event.preventDefault();
        }
    }
});
