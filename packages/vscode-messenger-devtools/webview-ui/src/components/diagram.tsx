import ForceGraph2D, { NodeObject } from 'react-force-graph-2d';

export function Diagram(): JSX.Element {
    // eslint-disable-next-line quotes
    const data = JSON.parse(`
    {
        "nodes": [
            {
                "id": "id1",
                "name": "name1",
                "val": 1
            },
            {
                "id": "id2",
                "name": "name2",
                "val": 10
            }
        ],
        "links": [
            {
                "source": "id1",
                "target": "id2"
            }
        ]
    }
    `);

    return <ForceGraph2D
        graphData={data}
        nodeAutoColorBy="group"
        nodeCanvasObject={(rawNode, ctx, globalScale) => {
            const node: NodeObject & { __bckgDimensions?: number[] } = rawNode;
            const label = String(node.id);
            const fontSize = 12 / globalScale;
            ctx.font = `${fontSize}px Sans-Serif`;
            const textWidth = ctx.measureText(label).width;
            const bckgDimensions = [textWidth, fontSize].map(n => n + fontSize * 0.2); // some padding

            ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
            if (node.x && node.y) {
                ctx.fillRect(node.x - bckgDimensions[0] / 2, node.y - bckgDimensions[1] / 2, bckgDimensions[0], bckgDimensions[1]);

                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                ctx.fillStyle = (node as any).color;
                ctx.fillText(label, node.x, node.y);
            }
            node.__bckgDimensions = bckgDimensions; // to re-use in nodePointerAreaPaint
        }}
        nodePointerAreaPaint={(rawNode, color, ctx) => {
            const node: NodeObject & { __bckgDimensions?: number[] } = rawNode;
            if (node.x && node.y) {
                ctx.fillStyle = color;
                const bckgDimensions = node.__bckgDimensions;
                bckgDimensions && ctx.fillRect(node.x - bckgDimensions[0] / 2, node.y - bckgDimensions[1] / 2, bckgDimensions[0], bckgDimensions[1]);
            }
        }}
    />;
}
