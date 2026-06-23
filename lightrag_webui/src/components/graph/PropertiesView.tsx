import { useMemo, useState, useEffect } from 'react'
import { useGraphStore, RawNodeType, RawEdgeType } from '@/stores/graph'
import { useBackendState } from '@/stores/state'
import Text from '@/components/ui/Text'
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/Tooltip'
import Button from '@/components/ui/Button'
import useLightragGraph from '@/hooks/useLightragGraph'
import { useTranslation } from 'react-i18next'
import { GitBranchPlus, Scissors, Lock } from 'lucide-react'
import EditablePropertyRow from './EditablePropertyRow'
import { lookupChunks, lookupDocumentMetadata } from '@/api/lightrag'

/**
 * Component that view properties of elements in graph.
 */
const PropertiesView = () => {
  const { getNode, getEdge } = useLightragGraph()
  const selectedNode = useGraphStore.use.selectedNode()
  const focusedNode = useGraphStore.use.focusedNode()
  const selectedEdge = useGraphStore.use.selectedEdge()
  const focusedEdge = useGraphStore.use.focusedEdge()
  const graphDataVersion = useGraphStore.use.graphDataVersion()
  const pipelineBusy = useBackendState.use.pipelineBusy()

  const { currentElement, currentType } = useMemo(() => {
    let type: 'node' | 'edge' | null = null
    let element: RawNodeType | RawEdgeType | null = null
    if (focusedNode) {
      type = 'node'
      element = getNode(focusedNode)
    } else if (selectedNode) {
      type = 'node'
      element = getNode(selectedNode)
    } else if (focusedEdge) {
      type = 'edge'
      element = getEdge(focusedEdge, true)
    } else if (selectedEdge) {
      type = 'edge'
      element = getEdge(selectedEdge, true)
    }

    if (element) {
      return {
        currentElement: type === 'node'
          ? refineNodeProperties(element as any)
          : refineEdgeProperties(element as any),
        currentType: type
      }
    }
    return { currentElement: null, currentType: null }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusedNode, selectedNode, focusedEdge, selectedEdge, graphDataVersion, getNode, getEdge])

  if (!currentElement) {
    return <></>
  }
  return (
    <div className="bg-background/80 max-w-xs rounded-lg border-2 p-2 text-xs backdrop-blur-lg">
      {currentType == 'node' ? (
        <NodePropertiesView node={currentElement as any} pipelineBusy={pipelineBusy} />
      ) : (
        <EdgePropertiesView edge={currentElement as any} pipelineBusy={pipelineBusy} />
      )}
    </div>
  )
}

type NodeType = RawNodeType & {
  relationships: {
    type: string
    id: string
    label: string
  }[]
}

type EdgeType = RawEdgeType & {
  sourceNode?: RawNodeType
  targetNode?: RawNodeType
}

const refineNodeProperties = (node: RawNodeType): NodeType => {
  const state = useGraphStore.getState()
  const relationships = []

  if (state.sigmaGraph && state.rawGraph) {
    try {
      if (!state.sigmaGraph.hasNode(node.id)) {
        console.warn('Node not found in sigmaGraph:', node.id)
        return {
          ...node,
          relationships: []
        }
      }

      const edges = state.sigmaGraph.edges(node.id)

      for (const edgeId of edges) {
        if (!state.sigmaGraph.hasEdge(edgeId)) continue;

        const edge = state.rawGraph.getEdge(edgeId, true)
        if (edge) {
          const isSource = node.id === edge.source
          const neighbourId = isSource ? edge.target : edge.source

          if (!state.sigmaGraph.hasNode(neighbourId)) continue;

          const neighbour = state.rawGraph.getNode(neighbourId)
          if (neighbour) {
            const neighbourLabel = neighbour.properties['entity_id'] ? neighbour.properties['entity_id'] : neighbour.labels.join(', ')
            const relationLabel = edge.properties?.keywords || 'Connected'
            relationships.push({
              type: relationLabel,
              id: neighbourId,
              label: `${isSource ? '➔' : '←'} ${neighbourLabel}`
            })
          }
        }
      }
    } catch (error) {
      console.error('Error refining node properties:', error)
    }
  }

  return {
    ...node,
    relationships
  }
}

const refineEdgeProperties = (edge: RawEdgeType): EdgeType => {
  const state = useGraphStore.getState()
  let sourceNode: RawNodeType | undefined = undefined
  let targetNode: RawNodeType | undefined = undefined

  if (state.sigmaGraph && state.rawGraph) {
    try {
      if (!state.sigmaGraph.hasEdge(edge.dynamicId)) {
        console.warn('Edge not found in sigmaGraph:', edge.id, 'dynamicId:', edge.dynamicId)
        return {
          ...edge,
          sourceNode: undefined,
          targetNode: undefined
        }
      }

      if (state.sigmaGraph.hasNode(edge.source)) {
        sourceNode = state.rawGraph.getNode(edge.source)
      }

      if (state.sigmaGraph.hasNode(edge.target)) {
        targetNode = state.rawGraph.getNode(edge.target)
      }
    } catch (error) {
      console.error('Error refining edge properties:', error)
    }
  }

  return {
    ...edge,
    sourceNode,
    targetNode
  }
}

const parseDateFromTitle = (title: string | null | undefined): Date => {
  if (!title) return new Date(0)
  
  // Try matching month names first, e.g. "September 8 and 29, 1999"
  const monthRegex = /(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2}(?:\s*(?:and|&|,)\s*\d{1,2})*|\d{1,2})?,?\s*(\d{4})/i
  const match = title.match(monthRegex)
  if (match) {
    const monthStr = match[1].toLowerCase()
    const dayStr = match[2] || '1'
    const yearStr = match[3]
    
    const dayMatch = dayStr.match(/\d+/)
    const day = dayMatch ? parseInt(dayMatch[0], 10) : 1
    
    const months: Record<string, number> = {
      january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
      july: 6, august: 7, september: 8, october: 9, november: 10, december: 11
    }
    return new Date(parseInt(yearStr, 10), months[monthStr], day)
  }

  // Fallback to YYYY-MM-DD
  const yyyymmdd = title.match(/\b(\d{4})[-_](\d{2})[-_](\d{2})\b/)
  if (yyyymmdd) {
    return new Date(parseInt(yyyymmdd[1], 10), parseInt(yyyymmdd[2], 10) - 1, parseInt(yyyymmdd[3], 10))
  }

  // Fallback to YYMMDD / YMMDD
  const yymmdd = title.match(/\b(\d{1,2})(\d{2})(\d{2})\b/)
  if (yymmdd) {
    let yy = parseInt(yymmdd[1], 10)
    const mm = parseInt(yymmdd[2], 10) - 1
    const dd = parseInt(yymmdd[3], 10)
    if (yy < 100) {
      yy = yy > 50 ? 1900 + yy : 2000 + yy
    }
    return new Date(yy, mm, dd)
  }

  return new Date(0)
}

const FilePropertyRow = ({ value }: { value: string }) => {
  const [metadata, setMetadata] = useState<Record<string, { url: string | null; title: string | null }>>({})
  const [loading, setLoading] = useState(false)

  const files = useMemo(() => {
    return typeof value === 'string' ? value.split('<SEP>').map(f => f.trim()).filter(Boolean) : []
  }, [value])

  useEffect(() => {
    if (files.length === 0) return
    setLoading(true)
    Promise.all(
      files.map(file => 
        lookupDocumentMetadata(file)
          .then(meta => ({ file, url: meta?.url || null, title: meta?.title || null }))
          .catch(() => ({ file, url: null, title: null }))
      )
    ).then(results => {
      const metaMap: Record<string, { url: string | null; title: string | null }> = {}
      for (const res of results) {
        metaMap[res.file] = { url: res.url, title: res.title }
      }
      setMetadata(metaMap)
    }).finally(() => setLoading(false))
  }, [files])

  const sortedFiles = useMemo(() => {
    return [...files].sort((a, b) => {
      const titleA = metadata[a]?.title || a
      const titleB = metadata[b]?.title || b
      const dateA = parseDateFromTitle(titleA)
      const dateB = parseDateFromTitle(titleB)
      return dateB.getTime() - dateA.getTime()
    })
  }, [files, metadata])

  if (loading) {
    return <span className="text-primary/40 animate-pulse">Loading links...</span>
  }

  if (sortedFiles.length === 0) {
    return <span>None</span>
  }

  return (
    <div className="flex flex-col gap-1 mt-1">
      {sortedFiles.map((file) => {
        const meta = metadata[file]
        const displayLabel = meta?.title || file
        const url = meta?.url
        if (url) {
          return (
            <a
              key={file}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 underline font-medium break-all"
            >
              {displayLabel}
            </a>
          )
        }
        return <span key={file}>{displayLabel}</span>
      })}
    </div>
  )
}

const ChunkLink = ({ id, initialMetadata }: { id: string; initialMetadata?: { original_url?: string; page_num?: number; doc_title?: string; content?: string } }) => {
  const [info, setInfo] = useState<{ original_url?: string; page_num?: number; content?: string; doc_title?: string } | null>(null)
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)

  const activeInfo = info || initialMetadata

  const handleMouseEnter = () => {
    if (loaded || loading || (activeInfo && activeInfo.content)) return
    setLoading(true)
    lookupChunks(id, false)
      .then((res) => {
        if (res && res[id]) {
          setInfo(res[id])
        }
        setLoaded(true)
      })
      .catch((err) => {
        console.error('Error fetching chunk content:', id, err)
      })
      .finally(() => {
        setLoading(false)
      })
  }

  const docTitle = activeInfo?.doc_title || (id.length > 30 ? `${id.substring(0, 15)}...${id.substring(id.length - 15)}` : id)
  const pageSuffix = activeInfo?.page_num ? ` (Page ${activeInfo.page_num})` : ''
  const displayLabel = `${docTitle}${pageSuffix}`

  const innerElement = activeInfo && activeInfo.original_url ? (
    <a
      href={activeInfo.page_num ? `${activeInfo.original_url}#page=${activeInfo.page_num}` : activeInfo.original_url}
      target="_blank"
      rel="noopener noreferrer"
      className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 underline font-medium text-xs break-all"
    >
      {displayLabel}
    </a>
  ) : (
    <span className="text-primary/50 text-xs break-all">
      {displayLabel}
    </span>
  )

  return (
    <Tooltip key={id}>
      <TooltipTrigger asChild>
        <div
          onMouseEnter={handleMouseEnter}
          className="cursor-help inline-block max-w-full hover:bg-primary/10 rounded px-1 transition-colors"
        >
          {innerElement}
        </div>
      </TooltipTrigger>
      <TooltipContent side="left" className="max-w-96 text-xs p-3">
        <div className="font-semibold text-primary mb-1 break-all">{id}</div>
        {loading ? (
          <span className="text-primary/40 animate-pulse">Loading chunk content...</span>
        ) : activeInfo?.content ? (
          <p className="text-muted-foreground whitespace-pre-wrap max-h-60 overflow-y-auto leading-relaxed">{activeInfo.content}</p>
        ) : (
          <span className="text-muted-foreground italic">Hover to load text content...</span>
        )}
      </TooltipContent>
    </Tooltip>
  )
}

const SourceIdPropertyRow = ({ value }: { value: string }) => {
  const [chunksInfo, setChunksInfo] = useState<Record<string, { original_url?: string; page_num?: number; file_path?: string; doc_title?: string; category?: string }>>({})
  const [loading, setLoading] = useState(false)

  const chunkIds = useMemo(() => {
    return typeof value === 'string' ? value.split('<SEP>').map(id => id.trim()).filter(Boolean) : []
  }, [value])

  useEffect(() => {
    if (chunkIds.length === 0) return
    setLoading(true)
    lookupChunks(chunkIds.join(','), true)
      .then((info) => {
        if (info) {
          setChunksInfo(info)
        }
      })
      .catch((err) => console.error('Error fetching chunk metadata:', err))
      .finally(() => setLoading(false))
  }, [chunkIds])

  const sortedChunkIds = useMemo(() => {
    return [...chunkIds].sort((a, b) => {
      const infoA = chunksInfo[a]
      const infoB = chunksInfo[b]
      const titleA = infoA?.doc_title || a
      const titleB = infoB?.doc_title || b
      const dateA = parseDateFromTitle(titleA)
      const dateB = parseDateFromTitle(titleB)
      return dateB.getTime() - dateA.getTime()
    })
  }, [chunkIds, chunksInfo])

  if (loading) {
    return <span className="text-primary/40 animate-pulse">Loading chunks metadata...</span>
  }

  if (sortedChunkIds.length === 0) {
    return <span>None</span>
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex flex-col gap-1 mt-1">
        {sortedChunkIds.map((id) => (
          <ChunkLink key={id} id={id} initialMetadata={chunksInfo[id]} />
        ))}
      </div>
    </TooltipProvider>
  )
}

const PropertyRow = ({
  name,
  value,
  onClick,
  tooltip,
  nodeId,
  edgeId,
  dynamicId,
  entityId,
  entityType,
  sourceId,
  targetId,
  isEditable = false,
  truncate,
  pipelineBusy = false
}: {
  name: string
  value: any
  onClick?: () => void
  tooltip?: string
  nodeId?: string
  entityId?: string
  edgeId?: string
  dynamicId?: string
  entityType?: 'node' | 'edge'
  sourceId?: string
  targetId?: string
  isEditable?: boolean
  truncate?: string
  pipelineBusy?: boolean
}) => {
  const { t } = useTranslation()

  const getPropertyNameTranslation = (name: string) => {
    const translationKey = `graphPanel.propertiesView.node.propertyNames.${name}`
    const translation = t(translationKey)
    return translation === translationKey ? name : translation
  }

  // Utility function to convert <SEP> to newlines
  const formatValueWithSeparators = (value: any): string => {
    if (typeof value === 'string') {
      return value.replace(/<SEP>/g, ';\n')
    }
    return typeof value === 'string' ? value : JSON.stringify(value, null, 2)
  }

  // Format the value to convert <SEP> to newlines
  const formattedValue = formatValueWithSeparators(value)
  let formattedTooltip = tooltip || formatValueWithSeparators(value)

  // If this is source_id field and truncate info exists, append it to the tooltip
  if (name === 'source_id' && truncate) {
    formattedTooltip += `\n(Truncated: ${truncate})`
  }

  // Use EditablePropertyRow for editable fields (description, entity_id and entity_type)
  if (isEditable && (name === 'description' || name === 'entity_id' || name === 'entity_type'  || name === 'keywords')) {
    return (
      <EditablePropertyRow
        name={name}
        value={value}
        onClick={onClick}
        nodeId={nodeId}
        entityId={entityId}
        edgeId={edgeId}
        dynamicId={dynamicId}
        entityType={entityType}
        sourceId={sourceId}
        targetId={targetId}
        isEditable={true}
        pipelineBusy={pipelineBusy}
        tooltip={tooltip || (typeof value === 'string' ? value : JSON.stringify(value, null, 2))}
      />
    )
  }

  if ((name === 'file_path' || name.toLowerCase() === 'file') && typeof value === 'string') {
    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="text-primary/60 tracking-wide whitespace-nowrap">
            {getPropertyNameTranslation(name)}
          </span>:
        </div>
        <FilePropertyRow value={value} />
      </div>
    )
  }

  if (name === 'source_id' && typeof value === 'string') {
    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="text-primary/60 tracking-wide whitespace-nowrap">
            {getPropertyNameTranslation(name)}
            {truncate && <sup className="text-red-500">†</sup>}
          </span>:
        </div>
        <SourceIdPropertyRow value={value} />
      </div>
    )
  }

  // For non-editable fields, use the regular Text component
  return (
    <div className="flex items-center gap-2">
      <span className="text-primary/60 tracking-wide whitespace-nowrap">
        {getPropertyNameTranslation(name)}
        {name === 'source_id' && truncate && <sup className="text-red-500">†</sup>}
      </span>:
      <Text
        className="hover:bg-primary/20 rounded p-1 overflow-hidden text-ellipsis"
        tooltipClassName="max-w-96 -translate-x-13"
        text={formattedValue}
        tooltip={formattedTooltip}
        side="left"
        onClick={onClick}
      />
    </div>
  )
}

const NodePropertiesView = ({ node, pipelineBusy }: { node: NodeType; pipelineBusy: boolean }) => {
  const { t } = useTranslation()

  const handleExpandNode = () => {
    useGraphStore.getState().triggerNodeExpand(node.id)
  }

  const handlePruneNode = () => {
    useGraphStore.getState().triggerNodePrune(node.id)
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-between items-center">
        <h3 className="text-md pl-1 font-bold tracking-wide text-blue-700">{t('graphPanel.propertiesView.node.title')}</h3>
        <div className="flex gap-3">
          {pipelineBusy && (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label={t('graphPanel.propertiesView.editLockedByPipeline')}
              aria-disabled="true"
              className="h-7 w-7 border border-amber-400 hover:bg-amber-50 dark:border-amber-600 dark:hover:bg-amber-900/40 !cursor-default"
              tooltip={t('graphPanel.propertiesView.editLockedByPipeline')}
              onClick={(e) => e.preventDefault()}
            >
              <Lock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            </Button>
          )}
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 border border-gray-400 hover:bg-gray-200 dark:border-gray-600 dark:hover:bg-gray-700"
            onClick={handleExpandNode}
            tooltip={t('graphPanel.propertiesView.node.expandNode')}
          >
            <GitBranchPlus className="h-4 w-4 text-gray-700 dark:text-gray-300" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 border border-gray-400 hover:bg-gray-200 dark:border-gray-600 dark:hover:bg-gray-700"
            onClick={handlePruneNode}
            tooltip={t('graphPanel.propertiesView.node.pruneNode')}
          >
            <Scissors className="h-4 w-4 text-gray-900 dark:text-gray-300" />
          </Button>
        </div>
      </div>
      <div className="bg-primary/5 max-h-96 overflow-auto rounded p-1">
        <PropertyRow name={t('graphPanel.propertiesView.node.id')} value={String(node.id)} />
        <PropertyRow
          name={t('graphPanel.propertiesView.node.labels')}
          value={node.labels.join(', ')}
          onClick={() => {
            useGraphStore.getState().setSelectedNode(node.id, true)
          }}
        />
        <PropertyRow name={t('graphPanel.propertiesView.node.degree')} value={node.degree} />
      </div>
      <h3 className="text-md pl-1 font-bold tracking-wide text-amber-700">{t('graphPanel.propertiesView.node.properties')}</h3>
      <div className="bg-primary/5 max-h-96 overflow-auto rounded p-1">
        {Object.keys(node.properties)
          .sort()
          .map((name) => {
            if (name === 'created_at' || name === 'truncate') return null; // Hide created_at and truncate properties
            return (
              <PropertyRow
                key={name}
                name={name}
                value={node.properties[name]}
                nodeId={String(node.id)}
                entityId={node.properties['entity_id']}
                entityType="node"
                isEditable={name === 'description' || name === 'entity_id' || name === 'entity_type'}
                truncate={node.properties['truncate']}
                pipelineBusy={pipelineBusy}
              />
            )
          })}
      </div>
      {node.relationships.length > 0 && (
        <>
          <h3 className="text-md pl-1 font-bold tracking-wide text-emerald-700">
            {t('graphPanel.propertiesView.node.relationships')}
          </h3>
          <div className="bg-primary/5 max-h-96 overflow-auto rounded p-1">
            {node.relationships.map(({ type, id, label }) => {
              return (
                <PropertyRow
                  key={id}
                  name={type}
                  value={label}
                  onClick={() => {
                    useGraphStore.getState().setSelectedNode(id, true)
                  }}
                />
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

const EdgePropertiesView = ({ edge, pipelineBusy }: { edge: EdgeType; pipelineBusy: boolean }) => {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-between items-center">
        <h3 className="text-md pl-1 font-bold tracking-wide text-violet-700">{t('graphPanel.propertiesView.edge.title')}</h3>
        {pipelineBusy && (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label={t('graphPanel.propertiesView.editLockedByPipeline')}
            aria-disabled="true"
            className="h-7 w-7 border border-amber-400 hover:bg-amber-50 dark:border-amber-600 dark:hover:bg-amber-900/40 !cursor-default"
            tooltip={t('graphPanel.propertiesView.editLockedByPipeline')}
            onClick={(e) => e.preventDefault()}
          >
            <Lock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          </Button>
        )}
      </div>
      <div className="bg-primary/5 max-h-96 overflow-auto rounded p-1">
        <PropertyRow name={t('graphPanel.propertiesView.edge.id')} value={edge.id} />
        {edge.type && <PropertyRow name={t('graphPanel.propertiesView.edge.type')} value={edge.type} />}
        <PropertyRow
          name={t('graphPanel.propertiesView.edge.source')}
          value={edge.sourceNode ? edge.sourceNode.labels.join(', ') : edge.source}
          onClick={() => {
            useGraphStore.getState().setSelectedNode(edge.source, true)
          }}
        />
        <PropertyRow
          name={t('graphPanel.propertiesView.edge.target')}
          value={edge.targetNode ? edge.targetNode.labels.join(', ') : edge.target}
          onClick={() => {
            useGraphStore.getState().setSelectedNode(edge.target, true)
          }}
        />
      </div>
      <h3 className="text-md pl-1 font-bold tracking-wide text-amber-700">{t('graphPanel.propertiesView.edge.properties')}</h3>
      <div className="bg-primary/5 max-h-96 overflow-auto rounded p-1">
        {Object.keys(edge.properties)
          .sort()
          .map((name) => {
            if (name === 'created_at' || name === 'truncate') return null; // Hide created_at and truncate properties
            return (
              <PropertyRow
                key={name}
                name={name}
                value={edge.properties[name]}
                edgeId={String(edge.id)}
                dynamicId={String(edge.dynamicId)}
                entityType="edge"
                sourceId={edge.sourceNode?.properties['entity_id'] || edge.source}
                targetId={edge.targetNode?.properties['entity_id'] || edge.target}
                isEditable={name === 'description' || name === 'keywords'}
                truncate={edge.properties['truncate']}
                pipelineBusy={pipelineBusy}
              />
            )
          })}
      </div>
    </div>
  )
}

export default PropertiesView
