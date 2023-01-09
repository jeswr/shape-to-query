import { parse } from '@labyrinth/testing/nodeFactory'
import { foaf, rdf, schema, sh } from '@tpluscode/rdf-ns-builders'
import { SELECT } from '@tpluscode/sparql-builder'
import { expect } from 'chai'
import { sparql } from '@tpluscode/rdf-string'
import { ex } from '@labyrinth/testing/namespace'
import type { GraphPointer } from 'clownface'
import { construct, shapeToPatterns } from '..'
import '@labyrinth/testing/sparql'

describe('@hydrofoil/shape-to-query', () => {
  describe('shapeToPatterns', () => {
    context('targets', () => {
      context('class target', () => {
        it('creates an rdf:type pattern', async () => {
          // given
          const shape = await parse`
            <>
              a ${sh.NodeShape} ;
              ${sh.targetClass} ${foaf.Person} .
          `

          // when
          const patterns = shapeToPatterns(shape, { subjectVariable: 'node' })
          const query = SELECT.ALL.WHERE`${patterns.whereClause()}`.build()

          // then
          expect(query).to.be.a.query(sparql`SELECT * WHERE {
            ?node ${rdf.type} ${foaf.Person}
          }`)
        })

        it('creates an rdf:type pattern for multiple targets', async () => {
          // given
          const shape = await parse`
            <>
              a ${sh.NodeShape} ;
              ${sh.targetClass} ${foaf.Person}, ${schema.Person} .
          `

          // when
          const patterns = shapeToPatterns(shape, { subjectVariable: 'node' })
          const query = SELECT.ALL.WHERE`${patterns.whereClause()}`.build()

          // then
          expect(query).to.be.a.query(sparql`SELECT * WHERE {
            ?node ${rdf.type} ?node_targetClass .
            FILTER ( ?node_targetClass IN (${foaf.Person}, ${schema.Person}) )
          }`)
        })
      })
    })

    context('property constraints', () => {
      it('creates a simple pattern for predicate path', async () => {
        // given
        const shape = await parse`
          <>
            a ${sh.NodeShape} ;
            ${sh.property}
            [
              ${sh.path} ${foaf.name} ;
            ] ; 
          .
        `

        // when
        const patterns = shapeToPatterns(shape, { subjectVariable: 'node' })
        const query = SELECT.ALL.WHERE`${patterns.whereClause()}`.build()

        // then
        expect(query).to.be.a.query(sparql`SELECT * WHERE {
          ?node ${foaf.name} ?node_0 .
        }`)
      })

      it('creates patterns for multiple properties', async () => {
        // given
        const shape = await parse`
          <>
            a ${sh.NodeShape} ;
            ${sh.property}
            [
              ${sh.path} ${foaf.name} ;
            ],
            [
              ${sh.path} ${foaf.lastName} ;
            ] ; 
          .
        `

        // when
        const patterns = shapeToPatterns(shape, { subjectVariable: 'node' })
        const query = SELECT.ALL.WHERE`${patterns.whereClause()}`.build()

        // then
        expect(query).to.be.a.query(sparql`SELECT * WHERE {
          {
            ?node ${foaf.name} ?node_0 .
          }
          UNION
          {
            ?node ${foaf.lastName} ?node_1 .
          }
        }`)
      })

      it('skips deactivated properties', async () => {
        // given
        const shape = await parse`
          <>
            a ${sh.NodeShape} ;
            ${sh.property}
            [
              ${sh.path} ${foaf.name} ;
              ${sh.deactivated} true ;
            ],
            [
              ${sh.path} ${foaf.lastName} ;
            ] ; 
          .
        `

        // when
        const patterns = shapeToPatterns(shape, { subjectVariable: 'node' })
        const query = SELECT.ALL.WHERE`${patterns.whereClause()}`.build()

        // then
        expect(query).to.be.a.query(sparql`SELECT * WHERE {
          ?node ${foaf.lastName} ?node_0 .
        }`)
      })
    })
  })

  describe('shapeToQuery', () => {
    describe('construct', () => {
      it('generates a query for variable', async () => {
        // given
        const shape = await parse`
          <>
            a ${sh.NodeShape} ;
            ${sh.property}
            [
              ${sh.path} ${foaf.name} ;
            ],
            [
              ${sh.path} ${foaf.lastName} ;
            ] ; 
          .
        `

        // when
        const query = construct(shape, { subjectVariable: 'person' }).build()

        // then
        expect(query).to.be.a.query(sparql`CONSTRUCT {
          ?person ${foaf.name} ?person_0 .
          ?person ${foaf.lastName} ?person_1 .
        } WHERE {
          { ?person ${foaf.name} ?person_0 . }
          union
          { ?person ${foaf.lastName} ?person_1 . }
        }`)
      })

      it('generates a query for IRI node', async () => {
        // given
        const shape = await parse`
          <>
            a ${sh.NodeShape} ;
            ${sh.property}
            [
              ${sh.path} ${foaf.name} ;
            ],
            [
              ${sh.path} ${foaf.lastName} ;
            ] ; 
          .
        `

        // when
        const focusNode = ex.John
        const query = construct(shape, { focusNode }).build()

        // then
        expect(query).to.be.a.query(sparql`CONSTRUCT {
          ${ex.John} ${foaf.name} ?resource_0 .
          ${ex.John} ${foaf.lastName} ?resource_1 .
        } WHERE {
          { ${ex.John} ${foaf.name} ?resource_0 . }
          union
          { ${ex.John} ${foaf.lastName} ?resource_1 . }
        }`)
      })

      it('generates a query with multiple target types', async () => {
        // given
        const shape = await parse`
          <>
            a ${sh.NodeShape} ;
            ${sh.targetClass} ${foaf.Person}, ${schema.Person} ;
            ${sh.property}
            [
              ${sh.path} ${foaf.name} ;
            ] ; 
          .
        `

        // when
        const focusNode = ex.John
        const query = construct(shape, { focusNode }).build()

        // then
        expect(query).to.be.a.query(sparql`CONSTRUCT {
          ${ex.John} ${rdf.type} ?resource_targetClass .
          ${ex.John} ${foaf.name} ?resource_0 .
        } WHERE {
            ${ex.John} ${rdf.type} ?resource_targetClass .
            FILTER ( ?resource_targetClass IN (${foaf.Person}, ${schema.Person}) )
            ${ex.John} ${foaf.name} ?resource_0 .
        }`)
      })
    })
  })

  context('shape with deep sh:node', () => {
    let shape: GraphPointer

    before(async () => {
      shape = await parse`
        <>
          a ${sh.NodeShape} ;
          ${sh.property}
          [
            ${sh.path} ${foaf.knows} ;
            ${sh.node} [
              ${sh.property} [ ${sh.path} ${foaf.name} ] ;
              ${sh.property} [
                ${sh.path} ${schema.address} ;
                ${sh.node} [
                  ${sh.property} [
                    ${sh.path} ${schema.addressLocality} ;
                  ], [
                    ${sh.path} ${schema.addressCountry} ;
                    ${sh.node} [
                      ${sh.property} [
                        ${sh.path} ${schema.name} ;
                      ] ;
                    ] ;
                  ] ;
                ] ;
              ] ;
            ] ;
          ] ; 
        .
      `
    })

    context('shapeToPatterns', () => {
      it('generates union of deep paths', () => {
        // when
        const patterns = shapeToPatterns(shape, {
          subjectVariable: 'node',
        })
        const query = SELECT.ALL.WHERE`${patterns.whereClause()}`.build()

        // then
        expect(query).to.be.a.query(sparql`SELECT * WHERE {
          {
            ?node ${foaf.knows} ?node_0 .
          }
          UNION
          { 
            ?node ${foaf.knows} ?node_0 .
            ?node_0 ${foaf.name} ?node_0_0 .
          }
          UNION
          {
            ?node ${foaf.knows} ?node_0 .
            ?node_0 ${schema.address} ?node_0_1 .
          }
          UNION
          {
            ?node ${foaf.knows} ?node_0 .
            ?node_0 ${schema.address} ?node_0_1 .
            ?node_0_1 ${schema.addressLocality} ?node_0_1_0 .
          }
          UNION
          {
            ?node ${foaf.knows} ?node_0 .
            ?node_0 ${schema.address} ?node_0_1 .
            ?node_0_1 ${schema.addressCountry} ?node_0_1_1 .
          }
          UNION
          {
            ?node ${foaf.knows} ?node_0 .
            ?node_0 ${schema.address} ?node_0_1 .
            ?node_0_1 ${schema.addressCountry} ?node_0_1_1 .
            ?node_0_1_1 ${schema.name} ?node_0_1_1_0 .
          }
        }`)
      })
    })

    context('construct', () => {
      it('does not produce duplicate patterns in CONSTRUCT clause', () => {
        // when
        const query = construct(shape, {
          subjectVariable: 'node',
        })

        // then
        expect(query.build()).to.be.a.query(sparql`CONSTRUCT {
          ?node ${foaf.knows} ?node_0 .
          ?node_0 ${foaf.name} ?node_0_0 .
          ?node_0 ${schema.address} ?node_0_1 .
          ?node_0_1 ${schema.addressLocality} ?node_0_1_0 .
          ?node_0_1 ${schema.addressCountry} ?node_0_1_1 .
          ?node_0_1_1 ${schema.name} ?node_0_1_1_0 .
        } WHERE {
          {
            ?node ${foaf.knows} ?node_0 .
          }
          UNION
          {
            ?node ${foaf.knows} ?node_0 .
            ?node_0 ${foaf.name} ?node_0_0 .
          }
          UNION
          {
            ?node ${foaf.knows} ?node_0 .
            ?node_0 ${schema.address} ?node_0_1 .
          }
          UNION
          {
            ?node ${foaf.knows} ?node_0 .
            ?node_0 ${schema.address} ?node_0_1 .
            ?node_0_1 ${schema.addressLocality} ?node_0_1_0 .
          }
          UNION
          {
            ?node ${foaf.knows} ?node_0 .
            ?node_0 ${schema.address} ?node_0_1 .
            ?node_0_1 ${schema.addressCountry} ?node_0_1_1 .
          }
          UNION
          {
            ?node ${foaf.knows} ?node_0 .
            ?node_0 ${schema.address} ?node_0_1 .
            ?node_0_1 ${schema.addressCountry} ?node_0_1_1 .
            ?node_0_1_1 ${schema.name} ?node_0_1_1_0 .
          }
        }`)
      })
    })
  })
})
