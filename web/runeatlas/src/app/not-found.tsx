import Link from "next/link";

export default function NotFound() {
    return (
        <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
            <div className="romc-panel romc-panel--soft space-y-6 p-12 max-w-lg">
                <h1 className="text-8xl font-bold text-[var(--accent)]">404</h1>
                <h2 className="text-2xl font-semibold text-white">Map Not Found</h2>
                <p className="text-[var(--muted)]">
                    It seems you've wandered into an unknown map. The coordinates you are looking for do not exist in this world.
                </p>
                <div className="pt-4">
                    <Link
                        href="/"
                        className="romc-button inline-flex items-center gap-2"
                    >
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="20"
                            height="20"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        >
                            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                            <polyline points="9 22 9 12 15 12 15 22"></polyline>
                        </svg>
                        Return to Prontera (Home)
                    </Link>
                </div>
            </div>
        </div>
    );
}
