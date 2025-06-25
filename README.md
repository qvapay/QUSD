# QUSD - Decentralized USD Stablecoin on Stacks

<div align="center">

![QUSD Logo](https://img.shields.io/badge/QUSD-Stablecoin-blue?style=for-the-badge&logo=bitcoin)
![Stacks](https://img.shields.io/badge/Stacks-Blockchain-orange?style=for-the-badge&logo=bitcoin)
![Clarity](https://img.shields.io/badge/Clarity-Smart%20Contracts-green?style=for-the-badge)

**A fully compliant SIP-010 stablecoin pegged to the US Dollar for QvaPay treasury internal use**

[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](https://opensource.org/licenses/ISC)
[![Clarity Version](https://img.shields.io/badge/Clarity-3.0-green.svg)](https://docs.stacks.co/write-smart-contracts/overview)
[![Epoch](https://img.shields.io/badge/Epoch-3.1-yellow.svg)](https://docs.stacks.co/understand-stacks/epochs)

</div>

---

## 📖 Overview

QUSD is a decentralized stablecoin built on the Stacks blockchain, designed to maintain a 1:1 peg with the US Dollar. This project implements a fully compliant SIP-010 fungible token standard, providing a secure and transparent digital representation of USD for internal treasury operations.

### 🌟 Key Features

- **SIP-010 Compliant**: Full adherence to Stacks Improvement Proposal 010 for fungible tokens
- **USD Pegged**: Maintains 1:1 parity with the US Dollar
- **Owner Controlled**: Secure minting and burning operations
- **Transparent**: All operations are publicly verifiable on the blockchain
- **Gas Efficient**: Optimized for minimal transaction costs
- **Comprehensive Testing**: Extensive test coverage ensuring reliability

## 🏗️ Project Structure

```
QUSD/
├── 📁 contracts/
│   └── 📄 QUSD.clar              # Main smart contract implementation
├── 📁 tests/
│   └── 📄 QUSD.test.ts           # Comprehensive test suite
├── 📁 deployments/
│   └── 📄 default.simnet-plan.yaml  # Deployment configuration
├── 📁 settings/
│   └── 📄 Devnet.toml            # Development network settings
├── 📄 Clarinet.toml              # Project configuration
├── 📄 package.json               # Dependencies and scripts
├── 📄 tsconfig.json              # TypeScript configuration
├── 📄 vitest.config.js           # Test runner configuration
└── 📄 README.md                  # This file
```

## 🚀 Quick Start

### Prerequisites

- [Clarinet](https://docs.hiro.so/clarinet/getting-started/installation) - Stacks development toolkit
- [Node.js](https://nodejs.org/) (v18 or higher)
- [npm](https://www.npmjs.com/) or [yarn](https://yarnpkg.com/)

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd QUSD
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start the local development environment**
   ```bash
   clarinet dev
   ```

4. **Run tests**
   ```bash
   npm test
   ```

## 📋 Smart Contract Functions

### Core Functions

| Function | Description | Access Control |
|----------|-------------|----------------|
| `mint` | Creates new QUSD tokens | Owner only |
| `burn` | Destroys QUSD tokens | Owner only |
| `transfer` | Transfers tokens between addresses | Token holder |

### Read-Only Functions

| Function | Description | Returns |
|----------|-------------|---------|
| `get-name` | Returns token name | "QUSD" |
| `get-symbol` | Returns token symbol | "QUSD" |
| `get-decimals` | Returns token decimals | 8 |
| `get-balance` | Returns balance for address | uint |
| `get-total-supply` | Returns total supply | uint |
| `get-token-uri` | Returns token metadata URI | none |

## 🧪 Testing

The project includes comprehensive tests covering all major functionality:

```bash
# Run all tests
npm test

# Run tests with coverage report
npm run test:report

# Watch mode for development
npm run test:watch
```

### Test Coverage

- ✅ Token metadata validation
- ✅ Minting operations (owner only)
- ✅ Burning operations (owner only)
- ✅ Transfer operations
- ✅ Access control validation
- ✅ Error handling
- ✅ Memo support in transfers

## 🔧 Development

### Local Development

1. **Start the simnet**
   ```bash
   clarinet dev
   ```

2. **Deploy contracts**
   ```bash
   clarinet deploy
   ```

3. **Interact with contracts**
   ```bash
   clarinet console
   ```

### Contract Interaction Examples

```clarity
;; Mint 1000 QUSD to an address
(contract-call? 'ST1NXBK3K5YYMD6FD41MVNP3JS1GABZ8TRVX023PT.QUSD mint u1000000 'ST1NXBK3K5YYMD6FD41MVNP3JS1GABZ8TRVX023PT)

;; Check balance
(contract-call? 'ST1NXBK3K5YYMD6FD41MVNP3JS1GABZ8TRVX023PT.QUSD get-balance 'ST1NXBK3K5YYMD6FD41MVNP3JS1GABZ8TRVX023PT)

;; Transfer tokens
(contract-call? 'ST1NXBK3K5YYMD6FD41MVNP3JS1GABZ8TRVX023PT.QUSD transfer u100000 'ST1NXBK3K5YYMD6FD41MVNP3JS1GABZ8TRVX023PT 'ST2NEB84ASENDXKYGJPQW86YXQCEFEX2ZQPG87ND none)
```

## 🌐 Deployment

### Networks

- **Simnet**: Local development and testing
- **Devnet**: Development network for integration testing
- **Testnet**: Public test network
- **Mainnet**: Production deployment (when ready)

### Deployment Configuration

The project includes deployment configurations for different networks in the `deployments/` directory.

## 🔒 Security

### Access Control

- **Owner-only operations**: Minting and burning are restricted to the contract owner
- **Token holder validation**: Transfers require the sender to be the token holder
- **Input validation**: All inputs are validated for correctness

### Error Codes

| Code | Error | Description |
|------|-------|-------------|
| 100 | `err-owner-only` | Operation restricted to contract owner |
| 101 | `err-not-token-owner` | Sender is not the token owner |
| 102 | `err-invalid-amount` | Amount must be greater than 0 |

## 📊 Token Economics

- **Name**: QUSD
- **Symbol**: QUSD
- **Decimals**: 8
- **Initial Supply**: 0 (minted as needed)
- **Peg**: 1:1 with USD
- **Use Case**: QvaPay treasury operations

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines

- Follow Clarity best practices
- Write comprehensive tests for new features
- Update documentation for any API changes
- Ensure all tests pass before submitting PR

## 📄 License

This project is licensed under the ISC License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Hiro](https://hiro.so/) for the Stacks development tools
- [Stacks Foundation](https://stacks.org/) for the blockchain infrastructure
- [QvaPay](https://qvapay.com/) for the project vision and requirements

## 📞 Support

For questions, issues, or contributions:

- **Issues**: [GitHub Issues](https://github.com/your-repo/QUSD/issues)
- **Discussions**: [GitHub Discussions](https://github.com/your-repo/QUSD/discussions)
- **Documentation**: [Stacks Documentation](https://docs.stacks.co/)

---

<div align="center">

**Built with ❤️ for the Stacks ecosystem**

[![Stacks](https://img.shields.io/badge/Powered%20by-Stacks-orange?style=for-the-badge&logo=bitcoin)](https://stacks.org/)

</div>

Deployer MainNet SP14CTSJZNKZ7YTR6C84368J2QXRW8RC20GSQ8KS2
Deployer TestNet ST14CTSJZNKZ7YTR6C84368J2QXRW8RC20K8V67HB
Official Token https://explorer.hiro.so/token/SP14CTSJZNKZ7YTR6C84368J2QXRW8RC20GSQ8KS2.QUSD?chain=mainnet
