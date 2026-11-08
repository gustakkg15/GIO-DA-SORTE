/**
 * GIO DA SORTE PRO — FASE 10.2.8: SUÍTE DE TESTES UNITÁRIOS DA RESOLUÇÃO DE PORTA
 * 
 * Validação estrita da matriz de 13 cenários de resolução de porta em server.ts
 */

import { resolveServerPort, parseValidPort } from '../server.ts';

interface TestCase {
  id: number;
  name: string;
  argv: string[];
  envPort: string | undefined;
  expected: number;
}

const testCases: TestCase[] = [
  {
    id: 1,
    name: 'CLI separado (--port 3000)',
    argv: ['node', 'server.ts', '--port', '3000'],
    envPort: undefined,
    expected: 3000,
  },
  {
    id: 2,
    name: 'CLI abreviado (-p 4000)',
    argv: ['node', 'server.ts', '-p', '4000'],
    envPort: undefined,
    expected: 4000,
  },
  {
    id: 3,
    name: 'CLI com igualdade (--port=5000)',
    argv: ['node', 'server.ts', '--port=5000'],
    envPort: undefined,
    expected: 5000,
  },
  {
    id: 4,
    name: 'CLI abreviado com igualdade (-p=4000)',
    argv: ['node', 'server.ts', '-p=4000'],
    envPort: undefined,
    expected: 4000,
  },
  {
    id: 5,
    name: 'CLI sobrepõe ambiente (CLI 3000, PORT 8080)',
    argv: ['node', 'server.ts', '--port', '3000'],
    envPort: '8080',
    expected: 3000,
  },
  {
    id: 6,
    name: 'Cloud Run (Sem CLI, PORT 8080)',
    argv: ['node', 'server.ts'],
    envPort: '8080',
    expected: 8080,
  },
  {
    id: 7,
    name: 'Sem configuração (Sem CLI e sem PORT)',
    argv: ['node', 'server.ts'],
    envPort: '',
    expected: 3000,
  },
  {
    id: 8,
    name: 'Porta zero (--port 0, PORT 8080)',
    argv: ['node', 'server.ts', '--port', '0'],
    envPort: '8080',
    expected: 8080,
  },
  {
    id: 9,
    name: 'Porta negativa (--port -50, PORT 8080)',
    argv: ['node', 'server.ts', '--port', '-50'],
    envPort: '8080',
    expected: 8080,
  },
  {
    id: 10,
    name: 'Porta acima do limite (--port 70000, PORT 8080)',
    argv: ['node', 'server.ts', '--port', '70000'],
    envPort: '8080',
    expected: 8080,
  },
  {
    id: 11,
    name: 'String inválida (--port abc, PORT 8080)',
    argv: ['node', 'server.ts', '--port', 'abc'],
    envPort: '8080',
    expected: 8080,
  },
  {
    id: 12,
    name: 'String parcialmente numérica (--port 3000abc, PORT 8080)',
    argv: ['node', 'server.ts', '--port', '3000abc'],
    envPort: '8080',
    expected: 8080,
  },
  {
    id: 13,
    name: 'Ambiente inválido (Sem CLI, PORT inválido)',
    argv: ['node', 'server.ts'],
    envPort: 'inválido',
    expected: 3000,
  },
];

async function runPortResolutionUnitTests() {
  console.log('================================================================');
  console.log('  GIO DA SORTE PRO — FASE 10.2.8: SUÍTE RESOLUÇÃO DE PORTAS');
  console.log('================================================================\n');

  let passed = 0;

  for (const tc of testCases) {
    const actual = resolveServerPort(tc.argv, tc.envPort);
    if (actual === tc.expected) {
      passed++;
      console.log(`✓ [PASS] #${tc.id}: ${tc.name} -> Resultado: ${actual}`);
    } else {
      console.error(`✗ [FAIL] #${tc.id}: ${tc.name} -> Obtido: ${actual}, Esperado: ${tc.expected}`);
    }
  }

  // Validações diretas da função parseValidPort
  console.log('\n--- VALIDAÇÃO DIRETA DA PARSEVALIDPORT ---');
  const checkStrictNumbers = [
    parseValidPort('3000') === 3000,
    parseValidPort('8080') === 8080,
    parseValidPort('3000abc') === null,
    parseValidPort('-10') === null,
    parseValidPort('0') === null,
    parseValidPort('65536') === null,
    parseValidPort(' 443 ') === 443,
  ];

  if (checkStrictNumbers.every(Boolean)) {
    console.log('✓ [PASS] Validação direta de inteiros estritos (1..65535) sem parsing parcial aprovada.');
  } else {
    console.error('✗ [FAIL] Falha em validação direta de parseValidPort');
    process.exit(1);
  }

  console.log(`\n================================================================`);
  console.log(`  RESULTADO FINAL: ${passed}/${testCases.length} testes unitários aprovados.`);
  console.log(`================================================================\n`);

  if (passed !== testCases.length) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runPortResolutionUnitTests().catch((err) => {
  console.error('Falha na suíte de testes de porta:', err);
  process.exit(1);
});
