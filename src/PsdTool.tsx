import type { IChangeEvent } from '@rjsf/core'
import type { UiSchema } from '@rjsf/utils'
import type { Psd } from 'ag-psd'
import Form from '@rjsf/react-bootstrap'
import validator from '@rjsf/validator-ajv8'
import { readPsd } from 'ag-psd'
import { getSchema, renderPsd } from 'ag-psd-psdtool'
import React, { useCallback, useRef, useState } from 'react'
import Col from 'react-bootstrap/Col'
import Container from 'react-bootstrap/Container'
import Alert from 'react-bootstrap/esm/Alert'
import Badge from 'react-bootstrap/esm/Badge'
import Row from 'react-bootstrap/esm/Row'
import { CodeBlock, CopyBlock } from 'react-code-blocks'
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

function PsdTool() {
  const [psdSchema, setPsdSchema] = useState<Record<string, unknown> | null>(null)
  const [psdSchemaJson, setPsdSchemaJson] = useState('')
  const [_, setPsdData] = useState<Record<string, unknown> | null>(null)
  const [psdDataJson, setPsdDataJson] = useState('')
  const canvas = useRef<HTMLCanvasElement>(null)
  const [psd, setPsd] = useState<Psd | null>(null)
  const [showAlert, setShowAlert] = useState(false)
  const [alertMessage, setAlertMessage] = useState('')

  const onDrop = useCallback((acceptedFiles) => {
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
        const currentPsd = readPsd(binaryStr)
        if (!currentPsd) {
          console.warn('Failed to read PSD file. Please make sure the file is a valid PSD.')
          setAlertMessage('Failed to read PSD file. Please make sure the file is a valid PSD.')
          setShowAlert(true)
          return
        }
        setPsd(currentPsd)
        const schema = getSchema(currentPsd)
        setPsdSchema(schema)
        setPsdSchemaJson(JSON.stringify(schema, null, 2))
      }
      reader.readAsArrayBuffer(file)
    })
  }, [])

  const onChange = useCallback((e: IChangeEvent<Record<string, unknown>, any, any>) => {
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
    setPsdData(data)
    setPsdDataJson(JSON.stringify(data, null, 2))
    renderPsd(psd, data, { canvas: canvas.current })
  }, [psd])

  const { getRootProps, getInputProps } = useDropzone({ accept: { 'image/psd': ['.psd'] }, multiple: false, onDrop })

  return (
    <>
      <Alert key="danger" variant="danger" show={showAlert}>
        {alertMessage}
      </Alert>
      <Container fluid className="vh-100">
        <Row>
          <Col xs={2} className="vh-100">
            <div className="overflow-auto mh-100">
              <Form schema={psdSchema || {}} uiSchema={uiSchema} validator={validator} onChange={onChange} />
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
                <CodeBlock text={psdSchemaJson} language="json" showLineNumbers={false} />
              </div>
            </Row>
            <Row style={{ height: '50%' }}>
              <div className="overflow-auto mh-100">
                <h2>Render Options</h2>
                <CopyBlock text={psdDataJson} language="json" showLineNumbers={false} />
              </div>
            </Row>
          </Col>
        </Row>
      </Container>
    </>
  )
}

export default PsdTool
