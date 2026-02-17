import React from 'react';
import { AlertTriangle, Check, X, HelpCircle, Info } from 'lucide-react';

export type ModalType = 'confirm' | 'alert' | 'info' | 'danger';

interface ConfirmationModalProps {
    isOpen: boolean;
    type?: ModalType;
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    onConfirm: (value?: string) => void;
    onCancel: () => void;
    showInput?: boolean;
    inputPlaceholder?: string;
    inputValue?: string;
    onInputChange?: (value: string) => void;
}

export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
    isOpen,
    type = 'confirm',
    title,
    message,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    onConfirm,
    onCancel,
    showInput = false,
    inputPlaceholder = '',
    inputValue = '',
    onInputChange
}) => {
    if (!isOpen) return null;

    const getIcon = () => {
        switch (type) {
            case 'danger': return <AlertTriangle className="text-red-600" size={24} />;
            case 'alert': return <AlertTriangle className="text-amber-600" size={24} />;
            case 'info': return <Info className="text-blue-600" size={24} />;
            case 'confirm': default: return <HelpCircle className="text-indigo-600" size={24} />;
        }
    };

    const getConfirmBtnClass = () => {
        switch (type) {
            case 'danger': return 'bg-red-600 hover:bg-red-700 text-white';
            case 'alert': return 'bg-amber-600 hover:bg-amber-700 text-white';
            case 'info': return 'bg-blue-600 hover:bg-blue-700 text-white';
            default: return 'bg-indigo-600 hover:bg-indigo-700 text-white';
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div
                className="bg-[var(--bg-panel)] border border-[var(--border)] rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200"
                role="dialog"
                aria-modal="true"
            >
                <div className="p-6">
                    <div className="flex items-start gap-4">
                        <div className={`p-3 rounded-full bg-[var(--bg-main)] border border-[var(--border)] flex-shrink-0`}>
                            {getIcon()}
                        </div>
                        <div className="flex-1">
                            <h3 className="text-lg font-bold text-[var(--text-main)] mb-2">{title}</h3>
                            <p className="text-sm text-[var(--text-muted)] leading-relaxed">{message}</p>
                            {showInput && (
                                <input
                                    type="text"
                                    value={inputValue}
                                    onChange={(e) => onInputChange?.(e.target.value)}
                                    placeholder={inputPlaceholder}
                                    className="w-full mt-4 px-3 py-2 bg-[var(--bg-main)] border border-[var(--border)] rounded-lg text-sm text-[var(--text-main)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] transition-all"
                                    autoFocus
                                />
                            )}
                        </div>
                    </div>
                </div>

                <div className="p-4 bg-[var(--bg-main)] border-t border-[var(--border)] flex justify-end gap-3">
                    {type !== 'info' && (
                        <button
                            onClick={onCancel}
                            className="px-4 py-2 text-sm font-medium text-[var(--text-main)] bg-[var(--bg-panel)] border border-[var(--border)] rounded-lg hover:bg-[var(--bg-hover)] transition-colors"
                        >
                            {cancelLabel}
                        </button>
                    )}
                    <button
                        onClick={() => onConfirm(showInput ? inputValue : undefined)}
                        className={`px-4 py-2 text-sm font-bold rounded-lg shadow-sm transition-colors flex items-center gap-2 ${getConfirmBtnClass()}`}
                    >
                        {type !== 'info' && <Check size={16} />}
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
};
