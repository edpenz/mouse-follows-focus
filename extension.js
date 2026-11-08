// SPDX-License-Identifier: GPL-2.0-or-later

import GLib from 'gi://GLib';
import Graphene from 'gi://Graphene';
import Meta from 'gi://Meta';

import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const TRACKED_TYPES = new Set([
    Meta.WindowType.NORMAL,
    Meta.WindowType.DIALOG,
    Meta.WindowType.MODAL_DIALOG,
]);

// Actor properties the shell eases when animating window map/resize/move
const ANIMATED_PROPS = [
    'scale-x', 'scale-y', 'translation-x', 'translation-y', 'x', 'y',
];

function isAnimating(actor) {
    // __animationInfo is set by the shell while a resize animation is pending
    return !!actor?.__animationInfo ||
        ANIMATED_PROPS.some(prop => actor?.get_transition(prop));
}

function pointerInRect([x, y], rect) {
    return x >= rect.x && x < rect.x + rect.width &&
        y >= rect.y && y < rect.y + rect.height;
}

export default class MouseFollowsFocusExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._focusWindow = null;
        this._grabbed = false;
        this._idleId = 0;
        this._forceSnap = false;
        this._lastRect = null;
        this._follow = null;
        this._laterId = 0;
        // Windows whose first frame hasn't been drawn yet
        this._pending = new WeakSet();
        // Last pointer position per window, as fractions of its frame
        this._relative = new WeakMap();

        global.display.connectObject(
            'notify::focus-window', () => this._onFocusChanged(),
            'window-created', (_d, win) => this._onWindowCreated(win),
            'grab-op-begin', () => {
                this._grabbed = true;
            },
            'grab-op-end', () => {
                this._grabbed = false;
                this._queueCheck();
            },
            this);
        Main.overview.connectObject('hidden', () => this._queueCheck(), this);

        this._onFocusChanged();
    }

    disable() {
        global.display.disconnectObject(this);
        Main.overview.disconnectObject(this);
        this._setFocusWindow(null);
        this._stopFollow();
        if (this._idleId) {
            GLib.source_remove(this._idleId);
            this._idleId = 0;
        }
        this._pending = null;
        this._relative = null;
        this._settings = null;
    }

    _onWindowCreated(win) {
        const actor = win.get_compositor_private();
        if (!actor)
            return;

        this._pending.add(win);
        actor.connectObject('first-frame', () => {
            actor.disconnectObject(this);
            this._pending.delete(win);
            if (win === this._focusWindow)
                this._queueCheck();
        }, this);
    }

    _onFocusChanged() {
        const win = global.display.focus_window;
        const tracked = win && TRACKED_TYPES.has(win.get_window_type()) &&
            !win.is_override_redirect() ? win : null;

        if (tracked === this._focusWindow)
            return;

        this._saveRelative(this._focusWindow);
        this._setFocusWindow(tracked);
        this._queueCheck();
    }

    _setFocusWindow(win) {
        this._focusWindow?.disconnectObject(this);
        this._focusWindow = win;
        this._forceSnap = false;
        this._lastRect = win?.get_frame_rect() ?? null;
        win?.connectObject(
            'position-changed', () => this._queueCheck(),
            'size-changed', () => this._onSizeChanged(),
            'unmanaged', () => this._setFocusWindow(null),
            this);
    }

    _onSizeChanged() {
        if (!this._forceSnap && !this._isSuppressed(this._focusWindow) &&
            this._settings.get_boolean('move-on-resize')) {
            // Remember where the pointer was in the window before the resize
            this._saveRelative(this._focusWindow, this._lastRect);
            this._forceSnap = true;
        }
        this._queueCheck();
    }

    _saveRelative(win, rect = win?.get_frame_rect()) {
        if (!win || win.minimized || !rect)
            return;

        const pointer = global.get_pointer();
        if (rect.width > 0 && rect.height > 0 && pointerInRect(pointer, rect)) {
            this._relative.set(win, [
                (pointer[0] - rect.x) / rect.width,
                (pointer[1] - rect.y) / rect.height,
            ]);
        }
    }

    _isSuppressed(win) {
        return this._grabbed || Main.overview.visible ||
            win.minimized || this._pending.has(win);
    }

    // Coalesce bursts of focus/geometry signals into one check once settled
    _queueCheck() {
        if (this._idleId)
            return;

        this._idleId = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            this._idleId = 0;
            this._check();
            return GLib.SOURCE_REMOVE;
        });
    }

    _check() {
        const force = this._forceSnap;
        this._forceSnap = false;

        const win = this._focusWindow;
        if (!win || win !== global.display.focus_window)
            return;
        if (this._isSuppressed(win))
            return;

        const rect = win.get_frame_rect();
        if (rect.width <= 0 || rect.height <= 0)
            return;
        this._lastRect = rect;
        if (!force && pointerInRect(global.get_pointer(), rect))
            return;

        const fraction = this._settings.get_string('snap-location') === 'relative'
            ? this._relative.get(win) ?? [0.5, 0.5]
            : [0.5, 0.5];

        const timing = this._settings.get_string('snap-timing');
        if (timing !== 'before' && isAnimating(win.get_compositor_private()))
            this._startFollow(win, fraction, timing === 'smooth');
        else
            this._warpTo(win, fraction);
    }

    // Track the window actor each frame until its animation finishes, either
    // moving the pointer along with it (smooth) or only at the end (after)
    _startFollow(win, fraction, smooth) {
        this._follow = {win, fraction, smooth};
        if (this._laterId)
            return;

        this._laterId = global.compositor.get_laters().add(
            Meta.LaterType.BEFORE_REDRAW, () => this._onFollowFrame());
    }

    _stopFollow() {
        if (this._laterId) {
            global.compositor.get_laters().remove(this._laterId);
            this._laterId = 0;
        }
        this._follow = null;
    }

    _onFollowFrame() {
        const {win, fraction, smooth} = this._follow;
        const actor = win.get_compositor_private();

        if (win !== this._focusWindow || !actor || this._isSuppressed(win)) {
            this._laterId = 0;
            this._follow = null;
            return GLib.SOURCE_REMOVE;
        }

        if (isAnimating(actor)) {
            if (smooth)
                this._warpToVisual(win, actor, fraction);
            return GLib.SOURCE_CONTINUE;
        }

        this._laterId = 0;
        this._follow = null;
        this._warpTo(win, fraction);
        return GLib.SOURCE_REMOVE;
    }

    // Map a point in the window's final frame through the actor's current
    // animated transform to find where it is on screen right now
    _warpToVisual(win, actor, [fx, fy]) {
        const frame = win.get_frame_rect();
        const buffer = win.get_buffer_rect();
        const point = actor.apply_transform_to_point(new Graphene.Point3D({
            x: frame.x - buffer.x + frame.width * fx,
            y: frame.y - buffer.y + frame.height * fy,
            z: 0,
        }));
        this._warp(win, Math.floor(point.x), Math.floor(point.y));
    }

    _warpTo(win, [fx, fy]) {
        const rect = win.get_frame_rect();
        this._warp(win,
            rect.x + Math.floor(rect.width * fx),
            rect.y + Math.floor(rect.height * fy));
    }

    _warp(win, x, y) {
        // Keep the pointer on screen for windows partially off a monitor
        const monitor = win.get_monitor();
        if (monitor >= 0) {
            const area = global.display.get_monitor_geometry(monitor);
            x = Math.min(Math.max(x, area.x), area.x + area.width - 1);
            y = Math.min(Math.max(y, area.y), area.y + area.height - 1);
        }

        global.stage.context.get_backend().get_default_seat().warp_pointer(x, y);
    }
}
