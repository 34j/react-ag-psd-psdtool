import type { UiSchema } from '@rjsf/utils'
import type { Psd } from 'ag-psd'
import Form from '@rjsf/react-bootstrap'
import validator from '@rjsf/validator-ajv8'
import { readPsd } from 'ag-psd'
import { getSchema, renderPsd } from 'ag-psd-psdtool'
import React, { useCallback, useRef, useState } from 'react'
import Col from 'react-bootstrap/Col'
import Container from 'react-bootstrap/Container'
import Row from 'react-bootstrap/Row'
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

function App() {
  const [schema, setSchema] = useState<Record<string, unknown> | null>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const [psd, setPsd] = useState<Psd | null>(null)

  const onDrop = useCallback((acceptedFiles) => {
    acceptedFiles.forEach((file) => {
      const reader = new FileReader()
      reader.onabort = () => console.warn('file reading was aborted')
      reader.onerror = () => console.warn('file reading has failed')
      reader.onload = () => {
      // Do whatever you want with the file contents
        const binaryStr = reader.result
        if (!(binaryStr instanceof ArrayBuffer)) {
          return
        }
        const currentPsd = readPsd(binaryStr)
        if (!currentPsd) {
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
    <Container fluid>
      <Row>
        <Col xs={2}>
          <Form schema={schema || {}} uiSchema={uiSchema} validator={validator} onChange={onChange} />
        </Col>
        <Col>
          <>
            <div {...getRootProps()}>
              <input {...getInputProps()} />
              <p>Drag and drop, or click to select your PSDTool-compatible PSD file</p>
            </div>
            <canvas
              ref={canvas}
              width={schema?.width || 0}
              height={schema?.height || 0}
              style={{ width: '100%' }}
            />
          </>
        </Col>
        <Col xs={2}>
          <CodeBlock text={JSON.stringify(schema, null, 2)} language="json" />
        </Col>
      </Row>
    </Container>
  )
}

export default App
