// components/canvas/file-icon.tsx
"use client";

interface FileIconProps {
  language: string;
}

export function FileIcon({ language }: FileIconProps) {
  const getIconColor = () => {
    switch (language) {
      case "typescript":
      case "tsx":
        return "text-blue-400";
      case "javascript":
      case "jsx":
        return "text-yellow-400";
      case "css":
      case "scss":
        return "text-blue-300";
      case "html":
        return "text-orange-400";
      case "json":
        return "text-green-400";
      default:
        return "text-gray-400";
    }
  };

  return (
    <svg
      className={`w-3 h-3 ${getIconColor()}`}
      fill="currentColor"
      viewBox="0 0 20 20"
    >
      <path d="M4 3a2 2 0 00-2 2v1.5h16V5a2 2 0 00-2-2H4z" />
      <path
        fillRule="evenodd"
        d="M18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1zm5-1a1 1 0 100 2h1a1 1 0 100-2H9z"
        clipRule="evenodd"
      />
    </svg>
  );
}
