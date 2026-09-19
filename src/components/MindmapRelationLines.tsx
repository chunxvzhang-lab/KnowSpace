import { relationPath, type MindmapRelation, type RelationBox } from "../core/mindmapRelations";

/**
 * The lines between topics, drawn underneath them.
 *
 * Underneath on purpose: a line crossing over a label costs both of them their
 * legibility, and the outline's own connectors are drawn at the same level as the
 * nodes they join.
 *
 * Given boxes rather than nodes, so it knows nothing about the layout engine or
 * the tree — which is what keeps the line's geometry in one pure function that
 * can be tested without a canvas.
 *
 * A relation whose topic is not in the boxes is not drawn. That covers more cases
 * than it sounds: a folded branch keeps its children off the canvas, and a
 * document whose heading was renamed has an id the file still mentions. Neither
 * is a reason to draw a line to nowhere, and neither costs the stored relation
 * anything — it comes back when its topic does.
 */
export function MindmapRelationLines({
  relations,
  boxes,
}: {
  relations: MindmapRelation[];
  /** Where each topic is, by id. */
  boxes: Map<string, RelationBox>;
}) {
  if (relations.length === 0) return null;

  return (
    <g className="mindmap-relations">
      {relations.map((relation) => {
        const from = boxes.get(relation.fromId);
        const to = boxes.get(relation.toId);
        if (!from || !to) return null;

        return (
          <path
            key={`${relation.fromId} ${relation.toId}`}
            className="mindmap-relation"
            d={relationPath(from, to)}
          />
        );
      })}
    </g>
  );
}
