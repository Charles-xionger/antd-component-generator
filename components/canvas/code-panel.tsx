// components/canvas/code-panel.tsx
"use client";

import { FileIcon } from "./file-icon";
import type { Artifact, ArtifactVersion, ParsedFile } from "./types";

interface CodePanelProps {
  isVisible: boolean;
  artifact: Artifact | null;
  selectedFile: ParsedFile | null;
  versions: ArtifactVersion[];
  selectedVersion: number | null;
  isLoadingVersions: boolean;
  copiedFile: string | null;
  onSelectFile: (file: ParsedFile) => void;
  onSelectVersion: (versionNumber: number) => void;
  onCopyToClipboard: (content: string, fileName: string) => void;
}

export function CodePanel({
  isVisible,
  artifact,
  selectedFile,
  versions,
  selectedVersion,
  isLoadingVersions,
  copiedFile,
  onSelectFile,
  onSelectVersion,
  onCopyToClipboard,
}: CodePanelProps) {
  return (
    <div
      className={`absolute inset-0 flex overflow-hidden transition-opacity duration-200 ${
        isVisible ? "opacity-100 z-10" : "opacity-0 z-0 pointer-events-none"
      }`}
    >
      {/* File Explorer Sidebar */}
      <div className="w-56 bg-gray-900 border-r border-gray-700 flex flex-col">
        <div className="px-3 py-2 text-xs text-gray-400 font-medium border-b border-gray-700 flex items-center justify-between">
          <span>File explorer</span>
          {versions.length > 0 && (
            <select
              value={selectedVersion || ""}
              onChange={(e) => onSelectVersion(Number(e.target.value))}
              className="bg-gray-800 text-gray-300 text-xs px-1.5 py-0.5 rounded border border-gray-600 focus:outline-none focus:border-blue-500"
              disabled={isLoadingVersions}
            >
              {versions.map((version) => (
                <option key={version.id} value={version.versionNumber}>
                  v{version.versionNumber}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="flex-1 overflow-y-auto py-1">
          {artifact && artifact.files.length > 0 ? (
            artifact.files.map((file) => {
              const fileName = file.path.split("/").pop() || file.path;
              const isSelected = selectedFile?.path === file.path;

              return (
                <button
                  key={file.path}
                  onClick={() => onSelectFile(file)}
                  className={`w-full px-3 py-1.5 text-left text-sm flex items-center gap-2 transition-colors ${
                    isSelected
                      ? "bg-gray-700 text-white"
                      : "text-gray-400 hover:bg-gray-800 hover:text-gray-200"
                  }`}
                >
                  <FileIcon language={file.language} />
                  <span className="truncate font-mono text-xs">{fileName}</span>
                </button>
              );
            })
          ) : (
            <div className="px-3 py-4 text-xs text-gray-500 text-center">
              暂无文件
            </div>
          )}
        </div>
      </div>

      {/* Code Editor Area */}
      <div className="flex-1 flex flex-col overflow-hidden bg-gray-900">
        {selectedFile ? (
          <>
            {/* File Tab */}
            <div className="bg-gray-800 px-4 py-2 border-b border-gray-700 flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-white">
                <FileIcon language={selectedFile.language} />
                <span className="font-mono">
                  {selectedFile.path.split("/").pop()}
                </span>
              </div>
              <button
                onClick={() =>
                  onCopyToClipboard(selectedFile.content, selectedFile.path)
                }
                className="px-2 py-1 text-xs text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors flex items-center gap-1"
                title="复制代码"
              >
                {copiedFile === selectedFile.path ? (
                  <>
                    <svg
                      className="w-3 h-3 text-green-400"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                    已复制
                  </>
                ) : (
                  <>
                    <svg
                      className="w-3 h-3"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path d="M8 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" />
                      <path d="M6 3a2 2 0 00-2 2v11a2 2 0 002 2h8a2 2 0 002-2V5a2 2 0 00-2-2 3 3 0 01-3 3H9a3 3 0 01-3-3z" />
                    </svg>
                    复制
                  </>
                )}
              </button>
            </div>
            {/* Code Content */}
            <div className="flex-1 overflow-auto bg-white">
              <pre className="p-4 text-sm whitespace-pre font-mono leading-relaxed">
                <code className="text-gray-100">{selectedFile.content}</code>
              </pre>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-500">
            <div className="text-center">
              <div className="text-lg mb-2">📁</div>
              <div className="text-sm">选择一个文件来查看代码</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
