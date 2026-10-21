# Realtime publishing design inputs

- `spec.md` — confirmed functional and UI acceptance criteria.
- `DESIGN.md` — selected B · Terminal Control tokens and component contract.
- `realtime-publishing-terminal-control.png` — selected high-fidelity visual reference; status remains above the activity stream.
- `realtime-publishing-wireframes.png` — full publish journey, success/failure, release center, rollback, unpublish and edge states.
- `realtime-publishing-wireframes.excalidraw` — editable source for the wireframes.

Implementation priorities:

1. Result and current stage.
2. What the system is doing and whether the previous online version is safe.
3. The next action on success or failure.
4. Expandable live activity stream.
5. Frozen historical records.

The six user-facing stages are: 准备、构建、上传、启动、验证、切换流量. Do not add staging, gray release, full release, pause-publish or stop-publish controls. “Pause” applies only to automatic log following after the user scrolls upward.
