// SPDX-License-Identifier: GPL-2.0-or-later

import GLib from 'gi://GLib';
import Graphene from 'gi://Graphene';
import Meta from 'gi://Meta';

// Actor properties the shell eases when animating window map/resize/move
const ANIMATED_PROPS = [
    'scale-x', 'scale-y', 'translation-x', 'translation-y', 'x', 'y',
];

function isAnimating(actor) {
    // __animationInfo is set by the shell while a resize animation is pending
    return !!actor?.__animationInfo ||
        ANIMATED_PROPS.some(prop => actor?.get_transition(prop));
}

// Moves the pointer to a point within a window, given as fractions of its
// frame, honouring the snap-timing setting
export class Warper {
    constructor(settings) {
        this._settings = settings;
        this._follow = null;
        this._laterId = 0;
    }

    destroy() {
        this.cancel();
        this._settings = null;
    }

    warp(win, fraction) {
        this.cancel();

        const timing = this._settings.get_string('snap-timing');
        if (timing !== 'before' && isAnimating(win.get_compositor_private()))
            this._startFollow(win, fraction, timing === 'smooth');
        else
            this._warpTo(win, fraction);
    }

    cancel() {
        if (this._laterId) {
            global.compositor.get_laters().remove(this._laterId);
            this._laterId = 0;
        }
        this._follow = null;
    }

    // Track the window actor each frame until its animation finishes, either
    // moving the pointer along with it (smooth) or only at the end (after)
    _startFollow(win, fraction, smooth) {
        this._follow = {win, fraction, smooth};
        win.connectObject('unmanaged', () => this.cancel(), this._follow);
        this._laterId = global.compositor.get_laters().add(
            Meta.LaterType.BEFORE_REDRAW, () => this._onFollowFrame());
    }

    _onFollowFrame() {
        const {win, fraction, smooth} = this._follow;
        const actor = win.get_compositor_private();

        if (actor && isAnimating(actor)) {
            if (smooth)
                this._warpToVisual(win, actor, fraction);
            return GLib.SOURCE_CONTINUE;
        }

        win.disconnectObject(this._follow);
        this._laterId = 0;
        this._follow = null;
        if (actor)
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
