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
import { CodeBlock } from 'react-code-blocks'
import { useDropzone } from 'react-dropzone'
import 'bootstrap'
import 'bootstrap/dist/css/bootstrap.min.css'
import 'bootstrap/dist/css/bootstrap.css'

const uiSchema: UiSchema = {
  'ui:submitButtonOptions': {
    norender: true,
  },
}

function PsdTool() {
  const [schema, setSchema] = useState<Record<string, unknown> | null>(null)
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
        setSchema(schema)
      }
      reader.readAsArrayBuffer(file)
    })
  }, [])

  const onChange = useCallback((e) => {
    if (!canvas.current) {
      return
    }
    if (!psd) {
      return
    }
    renderPsd(psd, e.formData, { canvas: canvas.current })
  }, [psd])

  const { getRootProps, getInputProps } = useDropzone({ accept: { 'image/psd': ['.psd'] }, multiple: false, onDrop })

  return (
    <>
      <Alert key="danger" variant="danger" show={showAlert}>
        {alertMessage}
      </Alert>
      <Container fluid className="vh-100">
        <Col xs={2} className="vh-100">
          <Form schema={schema || {}} uiSchema={uiSchema} validator={validator} onChange={onChange} />
        </Col>
        <Col className="vh-100">
          <>
            <div {...getRootProps()}>
              <input {...getInputProps()} />
              <h2>
                Drag & Drop
                <Badge bg="secondary">.PSD</Badge>
              </h2>
              <p>
                or click to select
                <Badge bg="secondary">.PSD</Badge>
                {' '}
                file
              </p>
            </div>
            <canvas
              ref={canvas}
              width={schema?.width || 0}
              height={schema?.height || 0}
              style={{ width: '100%' }}
            />
          </>
        </Col>
        <Col xs={2} className="vh-100">
          <div className="overflow-scroll" style={{ maxHeight: '100%' }}>
            <CodeBlock text={JSON.stringify(schema, null, 2)} language="json" />
          </div>
        </Col>
      </Container>
    </>
  )
}

export default PsdTool
