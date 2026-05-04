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

// Session recording UI state (kept global so it survives HTMX page swaps)
window.sessionRecorder = function (groupId, sessionId) {
    return {
        modalOpen: false,
        userId: "",
        userName: "",
        isAbsent: false,
        openSheet(userId, userName, isAbsent) {
            this.userId = userId;
            this.userName = userName;
            this.isAbsent = isAbsent || false;
            this.modalOpen = true;
        },
        closeSheet() {
            this.modalOpen = false;
            this.userId = "";
            this.userName = "";
            this.isAbsent = false;
        },
        addPenalty(catalogId) {
            if (!this.userId || this.isAbsent) return;
            htmx.ajax("POST", `/group/${groupId}/sessions/${sessionId}/penalty`, {
                target: "#member-entry-" + this.userId,
                swap: "outerHTML",
                values: { user_id: this.userId, catalog_id: catalogId },
            });
            this.closeSheet();
        },
        markArrived() {
            if (!this.userId) return;
            htmx.ajax("POST", `/group/${groupId}/sessions/${sessionId}/mark-arrived`, {
                target: "#member-entry-" + this.userId,
                swap: "outerHTML",
                values: { user_id: this.userId },
            });
            this.closeSheet();
        },
    };
};

