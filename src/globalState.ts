// Copyright (c) leo.zhao. All rights reserved.
// Licensed under the MIT license.

import * as vscode from "vscode";

const CookieKey = "leetcode-cookie";
const UserStatusKey = "leetcode-user-status";

export type UserDataType = {
    isSignedIn: boolean;
    isPremium: boolean;
    username: string;
    avatar: string;
    isVerified?: boolean;
};

class GlobalState {
    private context: vscode.ExtensionContext;
    private _state: vscode.Memento;
    private _cookie: string | undefined;
    private _userStatus: UserDataType | undefined;
    private cookieCleared = false;
    private userCleared = false;

    public initialize(context: vscode.ExtensionContext): void {
        this.context = context;
        this._state = this.context.globalState;
    }

    public setCookie(cookie: string): any {
        this.cookieCleared = false;
        this._cookie = cookie;
        return this._state.update(CookieKey, this._cookie);
    }
    public getCookie(): string | undefined {
        return this.cookieCleared ? undefined : this._cookie ?? this._state.get(CookieKey);
    }

    public setUserStatus(userStatus: UserDataType): any {
        this.userCleared = false;
        this._userStatus = userStatus;
        return this._state.update(UserStatusKey, this._userStatus);
    }

    public getUserStatus(): UserDataType | undefined {
        return this.userCleared ? undefined : this._userStatus ?? this._state.get(UserStatusKey);
    }

    public removeCookie(): void {
        this.cookieCleared = true;
        this._cookie = undefined;
        this._state.update(CookieKey, undefined);
    }

    public removeAll(): void {
        this.cookieCleared = true;
        this._cookie = undefined;
        this.userCleared = true;
        this._userStatus = undefined;
        this._state.update(CookieKey, undefined);
        this._state.update(UserStatusKey, undefined);
    }
}

export const globalState: GlobalState = new GlobalState();
