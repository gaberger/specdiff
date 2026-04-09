import React from "react";

const typeConfig = {
  removed:       { label: "Removed",     bg: "bg-red-100",    text: "text-red-600" },
  renamed:       { label: "Renamed",     bg: "bg-purple-100", text: "text-purple-600" },
  moved:         { label: "Moved",       bg: "bg-blue-100",   text: "text-blue-600" },
  "type-change": { label: "Type Change", bg: "bg-amber-100",  text: "text-amber-600" },
  added:         { label: "Added",       bg: "bg-green-100",  text: "text-green-600" },
  changed:       { label: "Changed",     bg: "bg-amber-100",  text: "text-amber-600" },
  unchanged:     { label: "Unchanged",   bg: "bg-stone-100",  text: "text-stone-500" },
};

function formatValue(val) {
  if (val === undefined || val === null) return "null";
  if (typeof val === "object") return JSON.stringify(val);
  return String(val);
}

/** Split a dot-path into individually clickable segments */
function pathSegments(fullPath) {
  if (!fullPath) return [];
  return fullPath.split(".");
}

export default function DiffItem({ result, onPathClick }) {
  const config = typeConfig[result.type] || typeConfig.changed;
  const segments = pathSegments(result.path);

  return (
    <tr className="border-b border-stone-200 hover:bg-stone-100/50 transition-colors">
      {/* Path column — each segment is individually clickable */}
      <td className="px-4 py-2.5 font-mono text-xs">
        <div className="break-all leading-relaxed">
          {segments.map((seg, i) => {
            const isLast = i === segments.length - 1;
            const partialPath = segments.slice(0, i + 1).join(".");
            // Determine which editor to scroll based on change type:
            // - added: path only in right (new) editor
            // - removed: path only in left (old) editor
            // - renamed/moved: old path in left, new path shown separately
            // - changed/type-change/unchanged: same path in both editors
            const side = result.type === "added" ? "right"
              : result.type === "removed" ? "left"
              : (result.type === "renamed" || result.type === "moved") ? "left"
              : "both";
            const hoverColor = side === "right" ? "hover:bg-green-100 hover:text-green-800"
              : side === "left" ? "hover:bg-amber-100 hover:text-amber-800"
              : "hover:bg-blue-100 hover:text-blue-800";
            return (
              <React.Fragment key={i}>
                {i > 0 && <span className="text-stone-300">.</span>}
                <span
                  onClick={() => onPathClick && onPathClick(partialPath, side)}
                  className={`cursor-pointer rounded px-0.5 transition-colors ${hoverColor} ${
                    isLast ? "font-bold text-stone-800" : "text-stone-400"
                  }`}
                  title={`${partialPath} (${side === "both" ? "both editors" : side + " editor"})`}
                >
                  {seg}
                </span>
              </React.Fragment>
            );
          })}
          {(result.type === "renamed" || result.type === "moved") && result.newPath && (
            <>
              <span className="text-amber-500 mx-1">{"\u2192"}</span>
              {pathSegments(result.newPath).map((seg, i, arr) => {
                const partialNewPath = arr.slice(0, i + 1).join(".");
                const isLast = i === arr.length - 1;
                return (
                  <React.Fragment key={`new-${i}`}>
                    {i > 0 && <span className="text-stone-300">.</span>}
                    <span
                      onClick={() => onPathClick && onPathClick(partialNewPath, "right")}
                      className={`cursor-pointer rounded px-0.5 transition-colors hover:bg-green-100 hover:text-green-800 ${
                        isLast ? "font-bold text-stone-600" : "text-stone-400"
                      }`}
                      title={partialNewPath}
                    >
                      {seg}
                    </span>
                  </React.Fragment>
                );
              })}
            </>
          )}
        </div>
      </td>

      {/* Change type badge column */}
      <td className="px-4 py-2.5">
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${config.bg} ${config.text}`}
        >
          {config.label}
        </span>
      </td>

      {/* Diff column */}
      <td className="px-4 py-2.5 font-mono text-xs">
        {result.type === "type-change" && result.oldType && result.newType ? (
          <span>
            <span className="text-red-600 line-through">{result.oldType}</span>
            <span className="text-stone-400 mx-1">{"\u2192"}</span>
            <span className="text-green-600">{result.newType}</span>
          </span>
        ) : (
          <span>
            {result.old !== undefined && (
              <span className="text-red-600 line-through mr-2">
                {formatValue(result.old)}
              </span>
            )}
            {result.new !== undefined && (
              <span className="text-green-600">
                {formatValue(result.new)}
              </span>
            )}
            {result.old === undefined && result.new === undefined && (
              <span className="text-stone-400">&mdash;</span>
            )}
          </span>
        )}
      </td>
    </tr>
  );
}
