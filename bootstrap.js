/**
 * bootstrap.js - cfc main entry point.
 * Copyright 2016 Yawning Angel.  All Rights Reserved.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

"use strict";

const {classes: Cc, interfaces: Ci, utils: Cu} = Components;
Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/devtools/Console.jsm");

//
// All the interesting work is done in cfc.jsm.
//

function startup(aData, aReason) {
  Cu.import("resource://cfc/cfc.jsm");
  cfc.onStartup(aData, aReason);
}

function shutdown(aData, aReason) {
  Cu.import("resource://cfc/cfc.jsm");
  cfc.onShutdown(aData, aReason);
}

// Stubs for the install/uninstall hook.
function install(aData, aReason) {
  // XXX: Handle migrating preferences if needed.
};

function uninstall(aData, aReason) {
  // XXX: Clean up user preferences.
};
