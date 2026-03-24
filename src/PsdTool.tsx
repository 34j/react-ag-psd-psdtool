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
import React, { useCallback, useRef, useState } from 'react'
import { Stack } from 'react-bootstrap'
import Col from 'react-bootstrap/Col'
import Container from 'react-bootstrap/Container'
import Alert from 'react-bootstrap/esm/Alert'
import Badge from 'react-bootstrap/esm/Badge'
import ProgressBar from 'react-bootstrap/esm/ProgressBar'
import Row from 'react-bootstrap/esm/Row'
import Form from 'react-bootstrap/Form'
import { CodeBlock } from 'react-code-blocks'
import { useDropzone } from 'react-dropzone'
import { ErrorBoundary, getErrorMessage } from 'react-error-boundary'
import { BsCursor } from 'react-icons/bs'
import 'bootstrap'
import 'bootstrap/dist/css/bootstrap.min.css'
import 'bootstrap/dist/css/bootstrap.css'

const uiSchema: UiSchema = {
  // Do not show the submit button
  'ui:submitButtonOptions': {
    norender: true,
  },
}

interface PsdToolProps {
  url?: string
  onLoad?: (schema: PSDToolJSONSchema) => void
  onChange?: (data: Record<string, unknown>) => void
}

function PsdTool({ url, onLoad, onChange }: PsdToolProps) {
  const [psdSchema, setPsdSchema] = useState<PSDToolJSONSchema>({ type: 'object', properties: {}, title: undefined })
  const getPathPartsFromLabel = useCallback((label?: string) => {
    const key = label || ''
    const path = (psdSchema?.properties as any)?.[key]?.$path
    if (Array.isArray(path) && path.length > 0) {
      return path.map(String)
    }
    return key.split('/').filter(Boolean)
  }, [psdSchema])

  // https://github.com/rjsf-team/react-jsonschema-form/blob/main/packages/react-bootstrap/src/CheckboxWidget/CheckboxWidget.tsx
  function CustomCheckboxWidget(props: WidgetProps) {
    // Only show the last part of the label after the last slash
    // e.g. folderX/layerY -> layerY
    const pathNames = getPathPartsFromLabel(props.label || '')
    const lastName = pathNames.at(-1) || ''
    return <CheckboxWidget {...props} name={lastName} label={lastName} />
  }

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
    const pathNames = getPathPartsFromLabel(props.label || '')
    const lastName = pathNames.at(-1) || ''
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
        <SelectWidget {...props} label={lastName} options={{ ...props.options, enumOptions }} disabled={props.value === false} />
      </Stack>
    )
  }

  function CustomFieldTemplate(props: FieldTemplateProps) {
    const pathNames = getPathPartsFromLabel(props.label || '')
    const level = pathNames.length - 1
    const lastName = pathNames.at(-1) || ''

    // disable shrinking
    return (
      <>
        <Stack direction="horizontal" gap={0}>
          <span style={{ visibility: 'hidden', display: 'block', width: `${level * 1.5}em` }} className="flex-shrink-0" />
          <FieldTemplate {...props} label={lastName} />
        </Stack>
      </>
    )
  }

  // https://github.com/rjsf-team/react-jsonschema-form/blob/a3a244c74f6727307fd52abd667c83dde3b2f0cb/packages/react-bootstrap/src/FieldTemplate/FieldTemplate.tsx#L63

  const widgets: RegistryWidgetsType = {
    CheckboxWidget: CustomCheckboxWidget,
    SelectWidget: CustomSelectWidget,
  }

  const templates = {
    FieldTemplate: CustomFieldTemplate,
  }

  const [_url, _setUrl] = useState<string>(url || '')
  const psdSchemaJson = React.useMemo(() => JSON.stringify(psdSchema, null, 2), [psdSchema])
  const [psdData, setPsdData] = useState<Record<string, unknown> | null>(null)
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

  return (
    <>
      <Alert key="danger" variant="danger" show={showAlert}>
        {alertMessage}
      </Alert>
      {loadingProgress > 0 && <ProgressBar animated striped now={loadingProgress} label={`Loading... ${loadingProgress}%`} />}
      <Container fluid className="vh-100">
        <Row>
          <Col xs={2} className="vh-100">
            <div className="overflow-auto overflow-x-auto mh-100">
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
            </div>
          </Col>
          <Col className="vh-100">
            <>
              <div {...getRootProps()} className="object-fit-contain">
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
              <Stack direction="horizontal" gap={1} className="justify-content-center">
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
              <canvas
                ref={canvas}
                width={loadedPsd?.width || 0}
                height={loadedPsd?.height || 0}
                className="mh-100 mw-100"
              />
            </>
          </Col>
          <Col xs={2} className="vh-100">
            <Row style={{ height: '50%' }}>
              <div className="overflow-auto mh-100">
                <h2>PSD Schema</h2>
                <CodeBlock text={psdSchemaJson} language="json" showLineNumbers={false} wrapLongLines={true} />
              </div>
            </Row>
            <Row style={{ height: '50%' }}>
              <div className="overflow-auto mh-100">
                <h2>Render Options</h2>
                <CodeBlock text={psdDataJson} language="json" showLineNumbers={false} wrapLongLines={true} />
              </div>
            </Row>
          </Col>
        </Row>
      </Container>
    </>
  )
}

export default PsdTool
