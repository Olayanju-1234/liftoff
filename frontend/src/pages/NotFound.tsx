import { useNavigate } from 'react-router-dom';

export default function NotFound() {
    const navigate = useNavigate();
    return (
        <div className="flex flex-col items-center justify-center h-full min-h-[60vh] text-center">
            <p className="text-6xl font-bold text-primary mb-4">404</p>
            <h2 className="text-xl font-semibold mb-2">Page not found</h2>
            <p className="text-muted-foreground mb-6 text-sm">
                The page you're looking for doesn't exist.
            </p>
            <button
                onClick={() => navigate('/')}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
            >
                Back to Dashboard
            </button>
        </div>
    );
}
