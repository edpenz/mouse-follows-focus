// SPDX-License-Identifier: GPL-2.0-or-later

import GLib from 'gi://GLib';

import { fractionIn, isTracked, windowAt } from './windows.js';

const CENTER = [0.5, 0.5];

// Keeps the pointer with the window it is in whenever that window is moved or
// resized by anything other than a pointer drag (e.g. keyboard tiling)
export class MotionTracker {
    constructor(settings, warper) {
        this._settings = settings;
        this._warper = warper;
        this._grabbed = false;
        this._idleId = 0;
        // Last settled frame rect per window
        this._rects = new Map();
        // Windows whose geometry changed since the last check
        this._changed = new Set();

        global.display.connectObject(
            'window-created', (_d, win) => this._onWindowCreated(win),
            'grab-op-begin', () => {
                this._grabbed = true;
            },
            'grab-op-end', () => {
                this._grabbed = false;
                this._resyncAll();
            },
            this);

        for (const win of global.display.list_all_windows())
            this._track(win);
    }

    destroy() {
        global.display.disconnectObject(this);
        for (const win of this._rects.keys()) {
            win.disconnectObject(this);
            win.get_compositor_private()?.disconnectObject(this);
        }
        if (this._idleId) {
            GLib.source_remove(this._idleId);
            this._idleId = 0;
        }
        this._rects.clear();
        this._changed.clear();
        this._warper = null;
        this._settings = null;
    }

    _onWindowCreated(win) {
        const actor = win.get_compositor_private();
        if (!actor || !isTracked(win))
            return;

        // Initial placement isn't a move; start tracking once first drawn
        actor.connectObject('first-frame', () => {
            actor.disconnectObject(this);
            this._track(win);
        }, this);
    }

    _track(win) {
        if (!isTracked(win) || this._rects.has(win))
            return;

        this._rects.set(win, win.get_frame_rect());
        win.connectObject(
            'position-changed', () => this._onGeometryChanged(win),
            'size-changed', () => this._onGeometryChanged(win),
            'unmanaged', () => {
                win.disconnectObject(this);
                this._rects.delete(win);
                this._changed.delete(win);
            },
            this);
    }

    _onGeometryChanged(win) {
        // Dragged windows carry the pointer with them already
        if (this._grabbed) {
            this._rects.set(win, win.get_frame_rect());
            return;
        }

        this._changed.add(win);
        if (!this._idleId) {
            this._idleId = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
                this._idleId = 0;
                this._check();
                return GLib.SOURCE_REMOVE;
            });
        }
    }

    _resyncAll() {
        for (const win of this._rects.keys())
            this._rects.set(win, win.get_frame_rect());
    }

    // Coalesced: find the window the pointer was in before the changes, and
    // if that window moved, take the pointer with it
    _check() {
        const changed = this._changed;
        this._changed = new Set();

        const pointer = global.get_pointer();
        const win = windowAt(pointer, w => this._rects.get(w));
        const oldRect = win && this._rects.get(win);

        for (const w of changed)
            this._rects.set(w, w.get_frame_rect());

        if (!win || !changed.has(win) || oldRect.width <= 0 || oldRect.height <= 0)
            return;

        const fraction = this._settings.get_string('snap-location') === 'relative'
            ? fractionIn(oldRect, pointer)
            : CENTER;
        this._warper.warp(win, fraction);
    }
}
