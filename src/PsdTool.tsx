import type { IChangeEvent } from '@rjsf/core'
import type { FieldTemplateProps, RegistryWidgetsType, UiSchema, WidgetProps } from '@rjsf/utils'
import type { Psd } from 'ag-psd'
import { Form as RJSFForm } from '@rjsf/react-bootstrap'
import CheckboxWidget from '@rjsf/react-bootstrap/lib/CheckboxWidget/CheckboxWidget.js'
import FieldTemplate from '@rjsf/react-bootstrap/lib/FieldTemplate/FieldTemplate.js'
import SelectWidget from '@rjsf/react-bootstrap/lib/SelectWidget/SelectWidget.js'
import validator from '@rjsf/validator-ajv8'
import { readPsd } from 'ag-psd'
import { getSchema, renderPsd } from 'ag-psd-psdtool'
import React, { useCallback, useRef, useState } from 'react'
import { Stack } from 'react-bootstrap'
import Col from 'react-bootstrap/Col'
import Container from 'react-bootstrap/Container'
import Alert from 'react-bootstrap/esm/Alert'
import Badge from 'react-bootstrap/esm/Badge'
import Row from 'react-bootstrap/esm/Row'
import Form from 'react-bootstrap/Form'
import { CodeBlock } from 'react-code-blocks'
import { useDropzone } from 'react-dropzone'
import { BsCursor } from 'react-icons/bs'
import 'bootstrap'
import 'bootstrap/dist/css/bootstrap.min.css'
import 'bootstrap/dist/css/bootstrap.css'

const uiSchema: UiSchema = {
  'ui:submitButtonOptions': {
    norender: true,
  },
}

function CustomCheckboxWidget(props: WidgetProps) {
  const lastName = (props.label || '').split('/').slice(-1)[0]
  return <CheckboxWidget {...props} name={lastName} label={lastName} />
}

function CustomSelectWidget(props: WidgetProps) {
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
  const enumOptions = props.options.enumOptions?.filter(option => option.value !== false)
  const lastName = (props.label || '').split('/').slice(-1)[0]
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
            props.onChange(enumOptions[0].value)
          }
        }}
      />
      <SelectWidget {...props} label={lastName} options={{ ...props.options, enumOptions }} disabled={props.value === false} />
    </Stack>
  )
}

function CustomFieldTemplate(props: FieldTemplateProps) {
  const slashCount = (props.id || '').split('/').length - 1
  const lastName = (props.id || '').split('/').slice(-1)[0]

  // disable shrinking
  return (
    <>
      <Stack direction="horizontal" gap={0}>
        <span style={{ visibility: 'hidden', display: 'block', width: `${slashCount * 1.5}em` }} className="flex-shrink-0" />
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

interface PsdToolProps {
  url?: string
  onLoad?: (schema: Record<string, unknown>) => void
  onChange?: (data: Record<string, unknown>) => void
}

function PsdTool({ url, onLoad, onChange }: PsdToolProps) {
  const [_url, _setUrl] = useState<string>(url || '')
  const [psdSchema, setPsdSchema] = useState<Record<string, unknown> | null>(null)
  const [psdSchemaJson, setPsdSchemaJson] = useState('')
  const [_, setPsdData] = useState<Record<string, unknown> | null>(null)
  const [psdDataJson, setPsdDataJson] = useState('')
  const canvas = useRef<HTMLCanvasElement>(null)
  const [psd, setPsd] = useState<Psd | null>(null)
  const [showAlert, setShowAlert] = useState(false)
  const [alertMessage, setAlertMessage] = useState('')

  const _onLoad = useCallback((buffer: ArrayBuffer) => {
    const currentPsd = readPsd(buffer)
    if (!currentPsd) {
      console.warn('Failed to read PSD file. Please make sure the file is a valid PSD.')
      setAlertMessage('Failed to read PSD file. Please make sure the file is a valid PSD.')
      setShowAlert(true)
      return
    }
    setPsd(currentPsd)
    const schema = getSchema(currentPsd)
    onLoad?.(schema)
    setPsdSchema(schema)
    setPsdSchemaJson(JSON.stringify(schema, null, 2))
  }, [])

  const _onDrop = useCallback((acceptedFiles: File[]) => {
    acceptedFiles.forEach((file) => {
      const reader = new FileReader()
      reader.onabort = () => {
        console.warn('file reading was aborted')
        setAlertMessage('File reading was aborted.')
        setShowAlert(true)
      }
      reader.onerror = () => {
        console.warn('file reading has failed')
        setAlertMessage('File reading has failed.')
        setShowAlert(true)
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
  }, [])

  const _onChange = useCallback((e: IChangeEvent<Record<string, unknown>, any, any>) => {
    if (!canvas.current) {
      return
    }
    if (!psd) {
      return
    }
    const data: Record<string, any> = {}
    for (const key in e.formData) {
      if (e.formData[key] !== psdSchema?.properties[key]?.default) {
        data[key] = e.formData[key]
      }
    }
    onChange?.(data)
    setPsdData(data)
    setPsdDataJson(JSON.stringify(data, null, 2))
    renderPsd(psd, data, { canvas: canvas.current })
  }, [psd])

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
  }, [_url])

  return (
    <>
      <Alert key="danger" variant="danger" show={showAlert}>
        {alertMessage}
      </Alert>
      <Container fluid className="vh-100">
        <Row>
          <Col xs={2} className="vh-100">
            <div className="overflow-auto overflow-x-auto mh-100">
              <RJSFForm schema={psdSchema || {}} uiSchema={uiSchema} validator={validator} onChange={_onChange} widgets={widgets} templates={templates} />
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
                  <Form.Control type="url" placeholder="Enter URL" value={_url} onChange={e => _setUrl(e.target.value)} />
                </Form>
              </Stack>
              <canvas
                ref={canvas}
                width={psdSchema?.width || 0}
                height={psdSchema?.height || 0}
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
