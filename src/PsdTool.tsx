import type { IChangeEvent } from '@rjsf/core'
import type { FieldTemplateProps, RegistryWidgetsType, UiSchema, WidgetProps } from '@rjsf/utils'
import type { Psd } from 'ag-psd'
import type { PSDToolJSONSchema } from 'ag-psd-psdtool'
import { Form as RJSFForm } from '@rjsf/react-bootstrap'
import CheckboxWidget from '@rjsf/react-bootstrap/lib/CheckboxWidget/CheckboxWidget.js'
import FieldTemplate from '@rjsf/react-bootstrap/lib/FieldTemplate/FieldTemplate.js'
import SelectWidget from '@rjsf/react-bootstrap/lib/SelectWidget/SelectWidget.js'
import { customizeValidator } from '@rjsf/validator-ajv8'
import { readPsd } from 'ag-psd'
import { getSchema, renderPsd } from 'ag-psd-psdtool'
import Ajv from 'ajv'
import React, { useCallback, useRef, useState } from 'react'
import { Stack } from 'react-bootstrap'
import Col from 'react-bootstrap/Col'
import Container from 'react-bootstrap/Container'
import Alert from 'react-bootstrap/esm/Alert'
import Badge from 'react-bootstrap/esm/Badge'
import ProgressBar from 'react-bootstrap/esm/ProgressBar'
import Row from 'react-bootstrap/esm/Row'
import Form from 'react-bootstrap/Form'
import { CopyBlock } from 'react-code-blocks'
import { useDropzone } from 'react-dropzone'
import { ErrorBoundary, getErrorMessage } from 'react-error-boundary'
import { BsCursor, BsGithub } from 'react-icons/bs'
import { SiNiconico, SiNpm, SiReadthedocs } from 'react-icons/si'
import { TransformComponent, TransformWrapper } from 'react-zoom-pan-pinch'
import 'bootstrap'
import 'bootstrap/dist/css/bootstrap.min.css'
import 'bootstrap/dist/css/bootstrap.css'

interface PsdToolProps {
  url?: string
  onLoad?: (schema: PSDToolJSONSchema) => void
  onChange?: (data: Record<string, unknown>) => void
}

function PsdTool({ url, onLoad, onChange }: PsdToolProps) {
  const [psdSchema, setPsdSchema] = useState<PSDToolJSONSchema>({ type: 'object', properties: {}, title: undefined })
  const [psdData, setPsdData] = useState<Record<string, unknown> | null>(null)
  const fullPsdData = React.useMemo(() => {
    const schema = psdSchema
    const data = structuredClone(psdData ?? {}) as Record<string, unknown>
    const ajv = new Ajv({ useDefaults: true, removeAdditional: true, allowUnionTypes: true })
    ajv.addKeyword('$path')
    const validate = ajv.compile(schema)
    validate(data)
    return data
  }, [psdSchema, psdData])
  const psdSchemaPathNodes = useCallback((label?: string) => {
    const key = label || ''
    return psdSchema?.properties?.[key]?.$path || []
  }, [psdSchema])
  const uiSchema = React.useMemo((): UiSchema => {
    const dynamicUiSchema: UiSchema = {
      // Do not show the submit button
      'ui:submitButtonOptions': {
        norender: true,
      },
    }
    for (const key in psdSchema.properties) {
      const pathNames = psdSchemaPathNodes(key)
      const lastName = pathNames.at(-1) || key
      const hasHiddenAncestor = pathNames.slice(0, -1).some((_, index) => {
        const ancestorName = pathNames.slice(0, index + 1).join('/')
        return fullPsdData[ancestorName] === false
      })
      dynamicUiSchema[key] = {
        'ui:title': lastName,
        'ui:name': pathNames.join('/'),
        ...(hasHiddenAncestor ? { 'ui:disabled': true } : {}),
      }
    }
    return dynamicUiSchema
  }, [psdSchema, psdSchemaPathNodes, fullPsdData])

  function CustomSelectWidget(props: WidgetProps) {
    if (!props.options.enumOptions) {
      return <SelectWidget {...props} />
    }
    let hasFalse = false
    for (const option of props.options.enumOptions || []) {
      if (option.value === false) {
        hasFalse = true
        break
      }
    }
    if (!hasFalse) {
      return <SelectWidget {...props} />
    }

    // Add a Checkbox on the left side
    // if `false` exists in `enumOptions`
    const enumOptions = props.options.enumOptions?.filter(option => option.value !== false)
    return (
      <Stack direction="horizontal" gap={1}>
        <CheckboxWidget
          {...props}
          checked={props.value !== false}
          label=""
          onChange={(value) => {
            if (value === false) {
              props.onChange(false)
            }
            else if (enumOptions && enumOptions.length > 0) {
              props.onChange(enumOptions[0]?.value)
            }
          }}
        />
        <SelectWidget {...props} options={{ ...props.options, enumOptions }} disabled={props.disabled || props.value === false} />
      </Stack>
    )
  }

  function CustomFieldTemplate(props: FieldTemplateProps) {
    const pathNames = psdSchemaPathNodes((props.uiSchema?.['ui:name'] as string | undefined) || '')
    const level = pathNames.length - 1

    // disable shrinking
    return (
      <>
        <Stack direction="horizontal" gap={0}>
          <span style={{ visibility: 'hidden', display: 'block', width: `${level * 1.5}em`, flexShrink: 0 }} />
          <FieldTemplate {...props} />
        </Stack>
      </>
    )
  }

  // https://github.com/rjsf-team/react-jsonschema-form/blob/a3a244c74f6727307fd52abd667c83dde3b2f0cb/packages/react-bootstrap/src/FieldTemplate/FieldTemplate.tsx#L63

  const widgets: RegistryWidgetsType = {
    SelectWidget: CustomSelectWidget,
  }

  const templates = {
    FieldTemplate: CustomFieldTemplate,
  }

  const [_url, _setUrl] = useState<string>(url || '')
  const psdSchemaJson = React.useMemo(() => JSON.stringify(psdSchema, null, 2), [psdSchema])
  const minimizedPsdData = React.useMemo(() => {
    const formData = psdData ?? {}
    const data: Record<string, unknown> = {}
    for (const key in formData) {
      if (formData[key] !== psdSchema?.properties?.[key]?.default) {
        data[key] = formData[key]
      }
    }
    return data
  }, [psdData, psdSchema])
  const psdDataJson = React.useMemo(() => JSON.stringify(minimizedPsdData, null, 2), [minimizedPsdData])
  const canvas = useRef<HTMLCanvasElement>(null)
  const [loadedPsd, setLoadedPsd] = useState<Psd | null>(null)
  const [showAlert, setShowAlert] = useState(false)
  const [alertMessage, setAlertMessage] = useState('')
  const [loadingProgress, setLoadingProgress] = useState(0)

  // Must be called when new PSD file is loaded
  const _onLoad = useCallback((buffer: ArrayBuffer) => {
    setLoadingProgress(40)
    try {
      const currentPsd = readPsd(buffer)
      setLoadingProgress(70)
      if (!currentPsd) {
        console.warn('Failed to read PSD file. Please make sure the file is a valid PSD.')
        setAlertMessage('Failed to read PSD file. Please make sure the file is a valid PSD.')
        setShowAlert(true)
        setLoadingProgress(0)
        return
      }
      setLoadedPsd(null)
      const schema = getSchema(currentPsd)
      setLoadingProgress(80)
      // Call onLoad callback (any user callback)
      onLoad?.(schema)
      setPsdData({})
      setPsdSchema(schema)
      setLoadingProgress(90)
      renderPsd(currentPsd, {}, { canvas: canvas.current })
      setLoadedPsd(currentPsd)
      setLoadingProgress(100)
    }
    finally {
      setTimeout(setLoadingProgress, 1000, 0)
    }
  }, [onLoad])

  // Callback for file drop
  const _onDrop = useCallback((acceptedFiles: File[]) => {
    acceptedFiles.forEach((file) => {
      const reader = new FileReader()
      setLoadingProgress(5)
      reader.onabort = () => {
        console.warn('file reading was aborted')
        setAlertMessage('File reading was aborted.')
        setLoadingProgress(0)
        setShowAlert(true)
      }
      reader.onerror = () => {
        console.warn('file reading has failed')
        setAlertMessage('File reading has failed.')
        setLoadingProgress(0)
        setShowAlert(true)
      }
      reader.onprogress = (event) => {
        if (!event.lengthComputable) {
          return
        }
        const percent = Math.min(35, Math.round((event.loaded / event.total) * 35))
        setLoadingProgress(Math.max(5, percent))
      }
      reader.onload = () => {
        setShowAlert(false)
        const binaryStr = reader.result
        if (!(binaryStr instanceof ArrayBuffer)) {
          return
        }
        _onLoad(binaryStr)
      }
      reader.readAsArrayBuffer(file)
    })
  }, [_onLoad])

  // Callback for form change
  const _onChange = useCallback((e: IChangeEvent<Record<string, unknown>, any, any>) => {
    if (!canvas.current) {
      return
    }
    if (!loadedPsd) {
      return
    }
    const data = (e.formData ?? {}) as Record<string, string | boolean>
    // Call onChange callback (any user callback)
    onChange?.(data)
    setPsdData(data)
    // Do nothing if the data does not match the schema
    renderPsd(loadedPsd, data, { canvas: canvas.current })
  }, [loadedPsd, onChange])

  const { getRootProps, getInputProps } = useDropzone({ accept: { 'image/psd': ['.psd'] }, multiple: false, onDrop: _onDrop })

  React.useEffect(() => {
    if (_url === '') {
      return
    }
    fetch(_url)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP error ${response.status}`)
        }
        return response.arrayBuffer()
      })
      .then((buffer) => {
        _onLoad(buffer)
      })
      .catch((error) => {
        console.warn(`Failed to fetch PSD file from ${_url}. Please make sure the URL is correct and the server allows CORS.`, error)
        setAlertMessage(`Failed to fetch PSD file from ${_url}. Please make sure the URL is correct and the server allows CORS. ${error}`)
        setShowAlert(true)
      })
  }, [_url, _onLoad])

  const rjsfValidator = customizeValidator({
    ajvOptionsOverrides: { allErrors: true, useDefaults: true, removeAdditional: true, allowUnionTypes: true },
    extenderFn: ajv => ajv.addKeyword('$path'),
  })
  const zeroSpacingClassName = 'g-0 m-0 p-0'
  const panelSpacingClassName = 'g-0 m-1 p-1'
  const fullHeightClassName = 'h-100'
  const flexColumnG0MinH0ClassName = 'd-flex flex-column g-0 m-0 p-0 min-h-0 border-start'
  const fullHeightFlexColumnClassName = `${flexColumnG0MinH0ClassName} ${fullHeightClassName}`
  const panelHeaderClassName = 'px-3 py-2 border-bottom bg-light m-0 p-1 g-0 flex-shrink-0'
  const iconLinkClassName = 'd-inline-flex align-items-center gap-1'

  return (
    <Container fluid className={`h-dvh-100 d-flex flex-column ${zeroSpacingClassName}`}>
      <Row className={`${panelHeaderClassName}`}>
        <Col>
          <Stack direction="horizontal" className="justify-content-between align-items-center">
            <span className="fw-bold">PSDTool (ag-psd-psdtool)</span>
            <Stack direction="horizontal" gap={3}>
              {/* <small className="text-secondary opacity-75">PSDTool but built on React + Pure Typescript, powered by ag-psd and ag-psd-psdtool.</small> */}
              <a href="https://oov.github.io/psdtool/" target="_blank" rel="noreferrer" className={iconLinkClassName}>
                PSDTool (Original)
              </a>
              <a href="http://seiga.nicovideo.jp/clip/1704637" target="_blank" rel="noreferrer" className={iconLinkClassName}>
                <SiNiconico size={16} />
                {' '}
                List of PSD files supporting advanced features
                1
              </a>
              <a href="https://seiga.nicovideo.jp/clip/1826158" target="_blank" rel="noreferrer" className={iconLinkClassName}>
                2
              </a>
              <a href="https://github.com/34j/react-ag-psd-psdtool" target="_blank" rel="noreferrer" className={iconLinkClassName}>
                <BsGithub size={16} />
                GitHub
              </a>
              <a href="https://34j.github.io/react-ag-psd-psdtool/docs/" target="_blank" rel="noreferrer" className={iconLinkClassName}>
                <SiReadthedocs size={16} />
                Docs
              </a>
              <a href="https://www.npmjs.com/package/react-ag-psd-psdtool" target="_blank" rel="noreferrer" className={iconLinkClassName}>
                <SiNpm size={16} />
                npm
              </a>
            </Stack>
          </Stack>
        </Col>
      </Row>
      <Alert key="danger" variant="danger" show={showAlert}>
        {alertMessage}
      </Alert>
      {loadingProgress > 0 && <ProgressBar animated striped now={loadingProgress} label={`Loading... ${loadingProgress}%`} />}
      <Row className={`${fullHeightClassName} flex-grow-1 ${zeroSpacingClassName} min-h-0`}>
        <Col xs={3} className={`${fullHeightFlexColumnClassName} min-h-0`}>
          <Row className={panelHeaderClassName}>
            <Col className="fw-bold">Options</Col>
          </Row>
          <Row className={`overflow-auto flex-grow-1 ${panelSpacingClassName} min-h-0`}>
            <ErrorBoundary fallbackRender={({ error, resetErrorBoundary }) => (
              <div role="alert">
                <p>Something went wrong:</p>
                <pre style={{ color: 'red' }}>{getErrorMessage(error)}</pre>
                <button onClick={resetErrorBoundary}>Retry</button>
              </div>
            )}
            >
              <RJSFForm
                schema={psdSchema}
                formData={psdData}
                uiSchema={uiSchema}
                widgets={widgets}
                templates={templates}
                validator={rjsfValidator}
                onChange={_onChange}
              />
            </ErrorBoundary>
          </Row>
        </Col>
        <Col className={`${fullHeightFlexColumnClassName} flex-grow-1`}>
          <Row className={`overflow-auto ${zeroSpacingClassName} min-h-0 flex-shrink-1`}>
            <div {...getRootProps()}>
              <input {...getInputProps()} />
              <h2 className="text-center">
                Drag & Drop
                {' '}
                <Badge bg="secondary">.PSD</Badge>
              </h2>
              <p className="text-center">
                or
                {' '}
                <BsCursor />
                click to select
                {' '}
                <Badge bg="secondary">.PSD</Badge>
                {' '}
                file
              </p>
            </div>
            <Stack direction="horizontal" className="justify-content-center align-items-center">
              <p>or set URL</p>
              <Form>
                <Form.Control
                  type="url"
                  placeholder="Enter URL"
                  value={_url}
                  onChange={e => _setUrl(e.target.value)}
                />
              </Form>
            </Stack>
          </Row>
          <Row className={`flex-grow-1 ${zeroSpacingClassName} min-h-0 flex-column`}>
            <Col className={`${zeroSpacingClassName} min-h-0 flex-grow-1`}>
              <Row className={`${panelHeaderClassName} flex-shrink-0`}>
                <Col className="fw-bold">Canvas</Col>
              </Row>
              <Row className={`flex-grow-1 ${zeroSpacingClassName} min-h-0`}>
                {/* overflow-hidden may be used only here! */}
                <Col className="m-1 p-1 min-h-0">
                  <TransformWrapper
                    minScale={0.1}
                    maxScale={8}
                    initialScale={1}
                    wheel={{ step: 0.1 }}
                    doubleClick={{ disabled: true }}
                  >
                    <TransformComponent>
                      <canvas
                        ref={canvas}
                        width={loadedPsd?.width || 0}
                        height={loadedPsd?.height || 0}
                        className="mh-100 mw-100"
                      />
                    </TransformComponent>
                  </TransformWrapper>
                </Col>
              </Row>
            </Col>

          </Row>
        </Col>
        <Col xs={3} className={fullHeightFlexColumnClassName}>
          <Row className={`${flexColumnG0MinH0ClassName} h-50 border-0`}>
            <Row className={panelHeaderClassName}>
              <Col className="fw-bold">PSD Schema</Col>
            </Row>
            <Col className="overflow-auto min-h-0 m-1 p-1">
              <CopyBlock text={psdSchemaJson} language="json" showLineNumbers={false} wrapLongLines={true} />
            </Col>
          </Row>
          <Row className={`${flexColumnG0MinH0ClassName} h-50`}>
            <Row className={panelHeaderClassName}>
              <Col className="fw-bold">Render Options</Col>
            </Row>
            <Col className="overflow-auto min-h-0 m-1 p-1">
              <CopyBlock text={psdDataJson} language="json" showLineNumbers={false} wrapLongLines={true} />
            </Col>
          </Row>
        </Col>
      </Row>
    </Container>
  )
}

export default PsdTool
