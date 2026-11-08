// SPDX-License-Identifier: GPL-2.0-or-later

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import {MotionTracker} from './lib/motion.js';
import {SwitcherTracker} from './lib/switcher.js';
import {Warper} from './lib/warper.js';

export default class MouseFollowsFocusExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._warper = new Warper(this._settings);
        this._motion = new MotionTracker(this._settings, this._warper);
        this._switcher = new SwitcherTracker(this._settings, this._warper);
    }

    disable() {
        this._switcher.destroy();
        this._motion.destroy();
        this._warper.destroy();
        this._switcher = null;
        this._motion = null;
        this._warper = null;
        this._settings = null;
    }
}
