import type { NotificationType } from 'vscode-messenger-common';

export const BugIntroduced: NotificationType<{
    command: string,
    text: string
}> = {
    method: 'bugIntroduced'
};

export const Refactor: NotificationType<{ text: string }> = {
    method: 'refactor'
};

