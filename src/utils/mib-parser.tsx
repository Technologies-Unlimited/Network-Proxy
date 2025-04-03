import * as snmp from 'snmp-native'

interface MibNode {
  name: string
  oid: string
  syntax: string
  description: string
  access: string
  status: string
  children: { [key: string]: MibNode }
}

class MibTree {
  private root: MibNode = {
    name: 'root',
    oid: '',
    syntax: '',
    description: '',
    access: '',
    status: '',
    children: {},
  }

  addNode(oid: string, node: Omit<MibNode, 'children'>): void {
    const parts = oid.split('.')
    let current = this.root

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      if (!current.children[part]) {
        current.children[part] = {
          name: '',
          oid: parts.slice(0, i + 1).join('.'),
          syntax: '',
          description: '',
          access: '',
          status: '',
          children: {},
        }
      }
      current = current.children[part]
    }

    Object.assign(current, node)
  }

  getNode(oid: string): MibNode | undefined {
    const parts = oid.split('.')
    let current = this.root

    for (const part of parts) {
      if (!current.children[part]) {
        return undefined
      }
      current = current.children[part]
    }

    return current
  }

  getNextOid(oid: string): string | undefined {
    const parts = oid.split('.')
    let current = this.root

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      if (!current.children[part]) {
        // If we can't find the exact OID, we need to find the next one
        const keys = Object.keys(current.children).sort(
          (a, b) => parseInt(a) - parseInt(b)
        )
        const nextKey = keys.find(key => parseInt(key) > parseInt(part))
        if (nextKey) {
          return [...parts.slice(0, i), nextKey].join('.')
        }
        return undefined
      }
      current = current.children[part]
    }

    // If we found the exact OID, return the first child (if any)
    const keys = Object.keys(current.children).sort(
      (a, b) => parseInt(a) - parseInt(b)
    )
    if (keys.length > 0) {
      return `${oid}.${keys[0]}`
    }

    return undefined
  }
}

export class MibParser {
  private mibs: { [key: string]: MibTree } = {}
  private session: snmp.Session

  constructor() {
    this.session = new snmp.Session({ host: 'localhost', community: 'public' })
  }

  loadMib(mibName: string, mibContent: string): void {
    const mibTree = new MibTree()
    const lines = mibContent.split('\n')
    let currentNode: Partial<MibNode> = {}
    let currentOid = ''

    for (const line of lines) {
      if (line.trim().startsWith('OBJECT-TYPE')) {
        if (currentOid && Object.keys(currentNode).length > 0) {
          mibTree.addNode(currentOid, currentNode as MibNode)
        }
        currentNode = {}
        currentOid = ''
      } else if (line.includes('OBJECT IDENTIFIER')) {
        const match = line.match(
          /(\w+)\s+OBJECT IDENTIFIER\s*::=\s*{\s*(\S+)\s+(\d+)\s*}/
        )
        if (match) {
          const [, name, parent, id] = match
          currentOid = `${this.getOidFromName(parent)}.${id}`
          currentNode.name = name
        }
      } else if (line.includes('::=')) {
        const match = line.match(/(\w+)\s+::=\s*{\s*(\S+)\s+(\d+)\s*}/)
        if (match) {
          const [, name, parent, id] = match
          currentOid = `${this.getOidFromName(parent)}.${id}`
          currentNode.name = name
        }
      } else if (line.includes('SYNTAX')) {
        currentNode.syntax = line.split('SYNTAX')[1].trim()
      } else if (line.includes('ACCESS')) {
        currentNode.access = line.split('ACCESS')[1].trim()
      } else if (line.includes('STATUS')) {
        currentNode.status = line.split('STATUS')[1].trim()
      } else if (line.includes('DESCRIPTION')) {
        currentNode.description = this.parseDescription(
          lines.slice(lines.indexOf(line) + 1)
        )
      }
    }

    if (currentOid && Object.keys(currentNode).length > 0) {
      mibTree.addNode(currentOid, currentNode as MibNode)
    }

    this.mibs[mibName] = mibTree
  }

  private parseDescription(lines: string[]): string {
    let description = ''
    for (const line of lines) {
      if (line.includes('::=')) break
      description += line.trim() + ' '
    }
    return description.trim().replace(/"/g, '')
  }

  private getOidFromName(name: string): string {
    for (const mib of Object.values(this.mibs)) {
      const node = this.findNodeByName(mib.getNode(''), name)
      if (node) return node.oid
    }
    return ''
  }

  private findNodeByName(
    node: MibNode | undefined,
    name: string
  ): MibNode | undefined {
    if (!node) return undefined
    if (node.name === name) return node
    for (const child of Object.values(node.children)) {
      const found = this.findNodeByName(child, name)
      if (found) return found
    }
    return undefined
  }

  getOidInfo(oid: string): MibNode | undefined {
    for (const mib of Object.values(this.mibs)) {
      const node = mib.getNode(oid)
      if (node) return node
    }
    return undefined
  }

  getNextOid(oid: string): string | undefined {
    for (const mib of Object.values(this.mibs)) {
      const nextOid = mib.getNextOid(oid)
      if (nextOid) return nextOid
    }
    return undefined
  }

  translateOid(oid: string): string {
    const parts = oid.split('.')
    let translated = ''
    let currentOid = ''

    for (const part of parts) {
      currentOid += (currentOid ? '.' : '') + part
      const info = this.getOidInfo(currentOid)
      if (info) {
        translated += (translated ? '.' : '') + info.name
      } else {
        translated += (translated ? '.' : '') + part
      }
    }

    return translated
  }

  get(oid: string): Promise<snmp.VarBind[]> {
    return new Promise((resolve, reject) => {
      this.session.get({ oid }, (error, varbinds) => {
        if (error) {
          reject(error)
        } else {
          resolve(varbinds)
        }
      })
    })
  }

  getNext(oid: string): Promise<snmp.VarBind[]> {
    return new Promise((resolve, reject) => {
      this.session.getNext({ oid }, (error, varbinds) => {
        if (error) {
          reject(error)
        } else {
          resolve(varbinds)
        }
      })
    })
  }

  getAll(oids: string[]): Promise<snmp.VarBind[]> {
    return new Promise((resolve, reject) => {
      this.session.getAll({ oids }, (error, varbinds) => {
        if (error) {
          reject(error)
        } else {
          resolve(varbinds)
        }
      })
    })
  }

  getSubtree(oid: string): Promise<snmp.VarBind[]> {
    return new Promise((resolve, reject) => {
      this.session.getSubtree({ oid }, (error, varbinds) => {
        if (error) {
          reject(error)
        } else {
          resolve(varbinds)
        }
      })
    })
  }

  set(
    oid: string,
    value: string | number | Buffer,
    type: snmp.DataType
  ): Promise<snmp.VarBind[]> {
    return new Promise((resolve, reject) => {
      this.session.set({ oid, value, type }, (error, varbinds) => {
        if (error) {
          reject(error)
        } else {
          resolve(varbinds)
        }
      })
    })
  }

  close(): void {
    this.session.close()
  }
}
