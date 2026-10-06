import { render } from 'preact'
import { App } from './App'
import './styles.css'

const host = document.getElementById('app')
if (host) render(<App />, host)
