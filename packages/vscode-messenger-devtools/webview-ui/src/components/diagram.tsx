import { useState } from 'react';
import ForceGraph2D, { GraphData, NodeObject } from 'react-force-graph-2d';
import { ExtensionData } from '../devtools-view';

type ComponentNode = NodeObject & {
    name: string;
    value: number;
}

export function createDiagramData(extension: ExtensionData | undefined): GraphData {

    const graphData: GraphData = { nodes: [], links: [] };

    if (!extension) {
        return graphData;
    }
    graphData.nodes.push({
        id: 'host extension',
        name: extension.name,
        value: 20
    } as ComponentNode);
    if (extension.info) {
        extension.info.webviews.forEach((webview) => {
            graphData.nodes.push({
                id: webview.id,
                name: webview.type,
                value: 10
            } as ComponentNode);
            graphData.links.push({
                source: 'host extension',
                target: webview.id,
                name: `${'host extension'}->${webview.id}`,
                value: 9
            } as ComponentNode);
            graphData.links.push({
                source: webview.id,
                target: 'host extension',
                name: `${webview.id}->${'host extension'}`,
                value: 9
            } as ComponentNode);
        });
    }
    return graphData;
}
type ComponentState = {
    data: GraphData
}

export type HighlightData = { link: string, type: string }

export let updateLinks: React.Dispatch<React.SetStateAction<Array<{ link: string, type: string }>>> | undefined = undefined;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function Diagram(options: ComponentState): JSX.Element {
    const [highlightLinks, setHighlightLinks] = useState(Array<HighlightData>());
    updateLinks = setHighlightLinks;

    function toParticleColor(type: string | undefined): string {
        switch (type) {
            case 'request': return '#3794ff';
            case 'response': return '#487e02';
            case 'notification': return '#cca700';
            default: return '';
        }
    }

    return <ForceGraph2D
        graphData={options.data}
        height={200}
        nodeAutoColorBy="name" // uses Node's property name
        nodeLabel="name"
        linkAutoColorBy="name"
        linkDirectionalParticles={1}
        linkDirectionalParticleSpeed={link => (link as ComponentNode).value * 0.001}
        linkDirectionalParticleWidth={link => highlightLinks.find(entry => entry.link === (link.source as NodeObject).id + '->' + (link.target as NodeObject).id) ? 4 : 0}
        linkDirectionalParticleColor={link => toParticleColor(highlightLinks.find(entry => entry.link === (link.source as NodeObject).id + '->' + (link.target as NodeObject).id)?.type)}
        nodeCanvasObject={(rawNode, ctx, _globalScale) => {
            paintNode(rawNode, (rawNode as { color: string }).color, ctx);
        }}
        nodePointerAreaPaint={paintNode}
    />;

}

function paintNode(rawNode: NodeObject, color: string, ctx: CanvasRenderingContext2D) {
    const node = rawNode as NodeObject & ComponentNode;
    if (node.x && node.y) {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.value / 2, 0, 2 * Math.PI, false);
        ctx.fill();
    }
}