import { Toaster as HotToaster } from 'react-hot-toast';

export default function Toaster() {
    return (
        <HotToaster
            position="bottom-right"
            toastOptions={{
                duration: 4000,
                style: {
                    background: 'rgb(var(--card))',
                    color: 'rgb(var(--ink))',
                    border: '1px solid rgb(var(--rule-strong))',
                    borderRadius: '3px',
                    boxShadow: '0 1px 0 rgb(var(--ink) / 0.05), 0 18px 32px -20px rgb(var(--ink) / 0.5)',
                    fontSize: '14px',
                    padding: '10px 12px',
                },
                success: { iconTheme: { primary: 'rgb(28 122 71)', secondary: 'rgb(251 249 244)' } },
                error: { iconTheme: { primary: 'rgb(179 38 30)', secondary: 'rgb(251 249 244)' } },
            }}
        />
    );
}
