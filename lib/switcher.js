// SPDX-License-Identifier: GPL-2.0-or-later

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { SwitcherPopup } from 'resource:///org/gnome/shell/ui/switcherPopup.js';

import { fractionIn, isTracked, rectContains, windowAt } from './windows.js';

const CENTER = [0.5, 0.5];

// Moves the pointer to windows focused with the Alt+Tab style switchers
export class SwitcherTracker {
    constructor(settings, warper) {
        this._settings = settings;
        this._warper = warper;
        this._popups = new Set();
        // Last pointer position per window, as fractions of its frame
        this._relative = new WeakMap();

        Main.uiGroup.connectObject('child-added', (_g, child) => {
            if (child instanceof SwitcherPopup)
                this._onPopupAdded(child);
        }, this);
        global.display.connectObject(
            'notify::focus-window', () => this._onFocusChanged(), this);
    }

    destroy() {
        Main.uiGroup.disconnectObject(this);
        global.display.disconnectObject(this);
        for (const popup of this._popups)
            popup.disconnectObject(this);
        this._popups.clear();
        this._warper = null;
        this._settings = null;
    }

    _onPopupAdded(popup) {
        this._popups.add(popup);
        popup.connectObject('destroy', () => this._popups.delete(popup), this);

        // Remember where the pointer was in the window being switched from
        const pointer = global.get_pointer();
        const from = windowAt(pointer);
        if (from)
            this._relative.set(from, fractionIn(from.get_frame_rect(), pointer));
    }

    _onFocusChanged() {
        const win = global.display.focus_window;
        if (this._popups.size === 0 || !win || !isTracked(win))
            return;

        const rect = win.get_frame_rect();
        if (rect.width <= 0 || rect.height <= 0 ||
            rectContains(rect, global.get_pointer()))
            return;

        const fraction = this._settings.get_string('snap-location') === 'relative'
            ? this._relative.get(win) ?? CENTER
            : CENTER;
        this._warper.warp(win, fraction);
    }
}
